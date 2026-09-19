import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyWorldbookBudget,
  invalidateWorldbookCache,
  matchWorldbook,
  readAgentWorldbook,
  recentTextOf,
  renderWorldbook,
  WORLDBOOK_MAX_ENTRIES,
  worldbookProjector,
} from "../capabilities/card/index.js";
import { estimateTokens } from "../context/token-estimate.js";
import type { CardEntry } from "../capabilities/card/types.js";

function entry(overrides: Partial<CardEntry> = {}): CardEntry {
  return {
    id: 0,
    comment: "",
    keys: [],
    secondary_keys: [],
    content: "",
    constant: false,
    selective: false,
    enabled: true,
    position: "after_char",
    insertion_order: 0,
    use_regex: false,
    extensions: {},
    words: 0,
    ...overrides,
  };
}

function cardFile(entries: Partial<CardEntry>[]): string {
  return JSON.stringify({
    spec: "chara_card_v3",
    spec_version: "3.0",
    name: "book",
    data: {
      name: "book",
      extensions: {},
      character_book: {
        name: "book",
        entries: entries.map((e, i) => ({
          id: i,
          keys: [],
          secondary_keys: [],
          comment: "",
          content: "",
          constant: false,
          selective: false,
          insertion_order: i,
          enabled: true,
          position: "after_char",
          use_regex: false,
          extensions: {},
          ...e,
        })),
      },
    },
  });
}

describe("matchWorldbook (R7.1)", () => {
  it("matches keys case-insensitively", () => {
    const entries = [entry({ keys: ["Winterfell"], content: "The castle." })];
    expect(matchWorldbook("we ride to winterfell", entries)).toHaveLength(1);
    expect(matchWorldbook("unrelated chatter", entries)).toHaveLength(0);
  });

  it("matches use_regex entries and falls back on invalid patterns", () => {
    const entries = [entry({ keys: ["drag(o+)n"], use_regex: true, content: "Fire." })];
    expect(matchWorldbook("a dragon flies", entries)).toHaveLength(1);
    const bad = [entry({ keys: ["(["], use_regex: true, content: "x" })];
    expect(matchWorldbook("([", bad)).toHaveLength(1);
    expect(matchWorldbook("zzz", bad)).toHaveLength(0);
  });

  it("always includes constant entries and skips disabled ones", () => {
    const entries = [
      entry({ constant: true, content: "Always." }),
      entry({ enabled: false, keys: ["ghost"], content: "Never." }),
    ];
    const hits = matchWorldbook("nothing relevant", entries);
    expect(hits.map((e) => e.content)).toEqual(["Always."]);
  });

  it("selective entries require both primary and secondary hits", () => {
    const entries = [entry({ keys: ["stark"], secondary_keys: ["direwolf"], selective: true })];
    expect(matchWorldbook("house stark gathers", entries)).toHaveLength(0);
    expect(matchWorldbook("a direwolf howls", entries)).toHaveLength(0);
    expect(matchWorldbook("house stark marches with a direwolf", entries)).toHaveLength(1);
  });

  it("sorts by insertion_order ascending", () => {
    const entries = [
      entry({ keys: ["b"], insertion_order: 5, content: "five" }),
      entry({ keys: ["a"], insertion_order: 1, content: "one" }),
    ];
    expect(matchWorldbook("a b", entries).map((e) => e.content)).toEqual(["one", "five"]);
  });
});

describe("applyWorldbookBudget (R7.2)", () => {
  it("caps entries at 8 by insertion_order priority", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ keys: [`k${i}`], insertion_order: i, content: `entry ${i}` }),
    );
    const out = applyWorldbookBudget(entries);
    expect(out).toHaveLength(Math.min(10, WORLDBOOK_MAX_ENTRIES));
    expect(out.map((e) => e.insertion_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("truncates by token budget keeping order priority", () => {
    const big = "lorem ipsum dolor sit amet ".repeat(160);
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry({ keys: ["x"], insertion_order: i, content: `${big} ${i}` }),
    );
    const out = applyWorldbookBudget(entries);
    expect(out.length).toBeLessThan(6);
    expect(out.length).toBeGreaterThan(0);
    expect(estimateTokens(renderWorldbook(out))).toBeLessThanOrEqual(2000);
    expect(out.map((e) => e.insertion_order)).toEqual(
      [...out.map((e) => e.insertion_order)].sort((a, b) => a - b),
    );
  });

  it("honors explicit budget overrides", () => {
    const entries = [entry({ keys: ["x"], content: "one" }), entry({ keys: ["x"], content: "two" })];
    expect(applyWorldbookBudget(entries, { maxEntries: 1 })).toHaveLength(1);
    expect(applyWorldbookBudget(entries, { maxTokens: 0 })).toHaveLength(1);
  });

  it("ranks unsorted input by insertion_order before capping", () => {
    const entries = [entry({ keys: ["x"], insertion_order: 9, content: "nine" }), entry({ keys: ["x"], insertion_order: 1, content: "one" })];
    const out = applyWorldbookBudget(entries, { maxEntries: 1 });
    expect(out.map((e) => e.content)).toEqual(["one"]);
  });
});

describe("recentTextOf (C1)", () => {
  it("strips previously injected worldbook blocks so they cannot retrigger", () => {
    const text = recentTextOf([
      { role: "user", content: "let us talk about baking" } as never,
      {
        role: "user",
        content: "<worldbook>\n<entry keys=\"Winterfell\">The castle.</entry>\n</worldbook>",
      } as never,
    ]);
    expect(text).not.toContain("Winterfell");
    expect(text).toContain("baking");
    expect(
      matchWorldbook(text, [entry({ keys: ["Winterfell"], content: "The castle." })]),
    ).toHaveLength(0);
  });

  it("survives unserializable toolCall arguments", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const text = recentTextOf([
      { role: "assistant", content: [{ type: "toolCall", id: "t", name: "x", arguments: circular }] } as never,
    ]);
    expect(text).toContain("x");
  });
});

describe("worldbookProjector", () => {
  let root: string;
  let slugDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-worldbook-"));
    slugDir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(slugDir, { recursive: true });
    invalidateWorldbookCache();
  });

  afterEach(() => {
    invalidateWorldbookCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function view() {
    return {
      agentId: "a1",
      profile: { slug: "hero" },
      projectStore: { getRootPath: () => root },
    } as never;
  }

  function messages(text: string) {
    return [{ role: "user", content: text } as never];
  }

  it("appends a worldbook block on keys hit", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["Winterfell"], content: "The castle." }]),
    );
    const project = worldbookProjector(view());
    expect(project).toBeDefined();
    const out = project!(messages("we ride to winterfell"));
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe("user");
    expect((out[1] as { content: string }).content).toContain("<worldbook>");
    expect((out[1] as { content: string }).content).toContain("The castle.");
  });

  it("leaves messages untouched without cards or hits", () => {
    const project = worldbookProjector(view());
    const noCards = project!(messages("hello"));
    expect(noCards).toHaveLength(1);

    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["Winterfell"], content: "The castle." }]),
    );
    invalidateWorldbookCache(root, "hero");
    const noHit = project!(messages("unrelated chatter"));
    expect(noHit).toHaveLength(1);
  });

  it("reloads after invalidation", () => {
    fs.writeFileSync(path.join(slugDir, "lore.card.json"), cardFile([]));
    expect(readAgentWorldbook(root, "hero")).toHaveLength(0);
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["x"], content: "now here" }]),
    );
    invalidateWorldbookCache(root, "hero");
    expect(readAgentWorldbook(root, "hero")).toHaveLength(1);
  });

  it("sees in-place rewrites without invalidation (C2)", () => {
    const file = path.join(slugDir, "lore.card.json");
    fs.writeFileSync(file, cardFile([{ keys: ["x"], content: "v1" }]));
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["v1"]);
    fs.writeFileSync(file, cardFile([{ keys: ["x"], content: "v2" }]));
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["v2"]);
  });

  it("invalidate by project root does not touch nested roots (M3)", () => {
    const root2 = path.join(root, "subproj");
    const dir2 = path.join(root2, ".spherse", "agents", "hero");
    fs.mkdirSync(dir2, { recursive: true });
    try {
      fs.writeFileSync(path.join(slugDir, "lore.card.json"), cardFile([{ keys: ["x"], content: "r1" }]));
      fs.writeFileSync(path.join(dir2, "lore.card.json"), cardFile([{ keys: ["x"], content: "r2" }]));
      expect(readAgentWorldbook(root, "hero")).toHaveLength(1);
      expect(readAgentWorldbook(root2, "hero")).toHaveLength(1);
      invalidateWorldbookCache(root);
      expect(readAgentWorldbook(root2, "hero").map((e) => e.content)).toEqual(["r2"]);
    } finally {
      invalidateWorldbookCache();
    }
  });
});
