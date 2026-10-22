import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addAgentCardLink,
  invalidateWorldbookCache,
  listAgentCardLinks,
  matchWorldbook,
  readAgentWorldbook,
  recentTextOf,
  removeAgentCardLink,
  selectWorldbookEntries,
  userSegmentIndex,
  worldbookProjector,
  worldbookStats,
  worldbookSystemCapability,
} from "../capabilities/card/index.js";
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
    position: 3,
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

describe("unbounded injection (v1.0.3: budget removed)", () => {
  it("injects all matched entries without caps", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry({ keys: [`k${i}`], insertion_order: i, content: `entry ${i}` }),
    );
    const out = matchWorldbook("k0 k1 k2 k3 k4 k5 k6 k7 k8 k9", entries);
    expect(out).toHaveLength(10);
    expect(out.map((e) => e.insertion_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("worldbookStats", () => {
  it("counts constant entries as always-on floor", () => {
    const stats = worldbookStats([
      entry({ constant: true, content: "Always." }),
      entry({ keys: ["k"], content: "Maybe." }),
    ]);
    expect(stats).toMatchObject({ entryCount: 2, enabledEntryCount: 2 });
    expect(stats.alwaysTokens).toBeGreaterThan(0);
    expect(stats.maxTurnTokens).toBeGreaterThanOrEqual(stats.alwaysTokens);
  });

  it("excludes disabled entries from both bounds", () => {
    const stats = worldbookStats([
      entry({ enabled: false, constant: true, content: "Off." }),
      entry({ enabled: false, keys: ["k"], content: "Off too." }),
    ]);
    expect(stats).toMatchObject({
      entryCount: 2,
      enabledEntryCount: 0,
      alwaysTokens: 0,
      maxTurnTokens: 0,
    });
  });

  it("excludes entries that can never match from the ceiling", () => {
    const stats = worldbookStats([
      entry({ keys: [], content: "No keys." }),
      entry({ keys: ["a"], selective: true, secondary_keys: [], content: "Half selective." }),
    ]);
    expect(stats.maxTurnTokens).toBe(0);
    expect(stats.enabledEntryCount).toBe(2);
  });

  it("includes fully keyed selective entries in the ceiling only", () => {
    const stats = worldbookStats([
      entry({ keys: ["a"], selective: true, secondary_keys: ["b"], content: "Full selective." }),
    ]);
    expect(stats.alwaysTokens).toBe(0);
    expect(stats.maxTurnTokens).toBeGreaterThan(0);
  });

  it("counts secondary-only plain entries as matchable", () => {
    const stats = worldbookStats([entry({ keys: [], secondary_keys: ["k"], content: "Secondary." })]);
    expect(stats.maxTurnTokens).toBeGreaterThan(0);
  });
});

describe("userSegmentIndex", () => {
  const convo = [
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1" },
    { role: "toolResult", content: "t1" },
    { role: "user", content: "u2" },
  ] as never;
  it("resolves depth to user boundaries and clamps overflow", () => {
    expect(userSegmentIndex(convo, 1)).toBe(3);
    expect(userSegmentIndex(convo, 2)).toBe(0);
    expect(userSegmentIndex(convo, 9)).toBe(0);
    expect(userSegmentIndex([], 1)).toBe(0);
  });
});

describe("selectWorldbookEntries", () => {
  it("groups hits by position and falls back without depth", () => {
    const groups = selectWorldbookEntries(
      [
        entry({ keys: ["x"], content: "a", position: 4 }),
        entry({ keys: ["x"], content: "b", position: 2, depth: 2 }),
        entry({ keys: ["x"], content: "c", position: 2 }),
        entry({ keys: ["x"], content: "d", position: 1 }),
      ],
      [{ role: "user", content: "x" } as never],
    );
    const byPosition = new Map(groups.map((g) => [`${g.position}:${g.depth}`, g.entries.length]));
    expect(byPosition.get("4:1")).toBe(1);
    expect(byPosition.get("2:2")).toBe(1);
    expect(byPosition.get("3:1")).toBe(1);
    expect(byPosition.get("1:1")).toBe(1);
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

  it("inserts the worldbook block before the current user by default", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["Winterfell"], content: "The castle." }]),
    );
    const project = worldbookProjector(view());
    expect(project).toBeDefined();
    const out = project!(messages("we ride to winterfell"));
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
    expect((out[0] as { content: string }).content).toContain("<worldbook>");
    expect((out[0] as { content: string }).content).toContain("The castle.");
    expect((out[1] as { content: string }).content).toBe("we ride to winterfell");
  });

  it("appends at the tail for position 4", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["Winterfell"], content: "The castle.", position: 4 }]),
    );
    const out = worldbookProjector(view())!(messages("we ride to winterfell"));
    expect(out).toHaveLength(2);
    expect((out[0] as { content: string }).content).toBe("we ride to winterfell");
    expect((out[1] as { content: string }).content).toContain("The castle.");
  });

  it("inserts at the depth boundary for position 2 without splitting turns", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["x"], content: "Deep lore.", position: 2, depth: 2 }]),
    );
    const history = [
      { role: "user", content: "first x" },
      { role: "assistant", content: [{ type: "text", text: "answering" }] },
      { role: "toolResult", content: [{ type: "text", text: "tool says x" }] },
      { role: "user", content: "second" },
    ] as never;
    const out = worldbookProjector(view())!(history);
    expect(out).toHaveLength(5);
    expect((out[0] as { content: string }).content).toContain("Deep lore.");
    expect((out[1] as { content: string }).content).toBe("first x");
    expect((out[4] as { content: string }).content).toBe("second");
    expect(out[0].role).toBe("user");
  });

  it("clamps over-deep positions to the front", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["x"], content: "Deep lore.", position: 2, depth: 9 }]),
    );
    const out = worldbookProjector(view())!(messages("only x here"));
    expect(out).toHaveLength(2);
    expect((out[0] as { content: string }).content).toContain("Deep lore.");
  });

  it("merges same-position hits into one block and skips system positions", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([
        { keys: ["x"], content: "Tail.", position: 4 },
        { keys: ["x"], content: "Before.", position: 3 },
        { keys: ["x"], content: "System.", position: 1 },
      ]),
    );
    const out = worldbookProjector(view())!(messages("x marks it"));
    expect(out).toHaveLength(3);
    expect((out[0] as { content: string }).content).toContain("Before.");
    expect((out[0] as { content: string }).content).not.toContain("System.");
    expect((out[2] as { content: string }).content).toContain("Tail.");
  });

  it("falls back to before-current-user when depth is missing", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["x"], content: "No depth.", position: 2 }]),
    );
    const out = worldbookProjector(view())!(messages("x here"));
    expect(out).toHaveLength(2);
    expect((out[0] as { content: string }).content).toContain("No depth.");
  });

  it("keeps hits order for groups landing at the same index", () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([
        { keys: ["x"], content: "First.", position: 2, depth: 1, insertion_order: 1 },
        { keys: ["x"], content: "Second.", position: 3, insertion_order: 2 },
      ]),
    );
    const out = worldbookProjector(view())!(messages("x here"));
    expect(out).toHaveLength(3);
    const first = (out[0] as { content: string }).content;
    const second = (out[1] as { content: string }).content;
    expect(first).toContain("First.");
    expect(second).toContain("Second.");
  });

  it("holds insertion order through the attachments projector", async () => {
    const { attachmentContextProjector } = await import(
      "../capabilities/attachments/projector.js"
    );
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["Winterfell"], content: "The castle." }]),
    );
    const withRefs = [
      { role: "user", content: "we ride to winterfell", _attachments: [{ path: "a.png" }] },
    ] as never;
    const wbFirst = worldbookProjector(view())!(withRefs);
    const out = attachmentContextProjector()(wbFirst);
    expect(out).toHaveLength(2);
    expect((out[0] as { content: string }).content).toContain("The castle.");
    expect((out[1] as { content: string }).content).toBe("we ride to winterfell");
    expect(out[1]).not.toHaveProperty("_attachments");
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
    fs.writeFileSync(file, cardFile([{ keys: ["x"], content: "v2 with more content" }]));
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["v2 with more content"]);
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

describe("worldbookSystemCapability", () => {
  let root: string;
  let slugDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-worldbook-sys-"));
    slugDir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(slugDir, { recursive: true });
    invalidateWorldbookCache();
  });

  afterEach(() => {
    invalidateWorldbookCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function hooks(logger?: { warn: (...args: unknown[]) => void }) {
    return worldbookSystemCapability({
      projectStore: {
        getRootPath: () => root,
        getAgent: () => ({ getProfile: () => ({ slug: "hero" }) }),
      } as never,
      ...(logger ? { logger: logger as never } : {}),
    }).turnHooks!("a1", "s1");
  }

  function agent(systemPrompt: string) {
    return {
      state: { systemPrompt, messages: [{ role: "user", content: "winterfell" } as never] },
    } as never;
  }

  const MCP = "<!-- spherse:mcp-context:start -->\ntools\n<!-- spherse:mcp-context:end -->";

  it("appends position 1 after the MCP block", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["winterfell"], content: "The castle.", position: 1 }]),
    );
    const a = agent(`base\n\n${MCP}`);
    await hooks().beforeTurn!(a);
    const prompt = (a.state as { systemPrompt: string }).systemPrompt;
    expect(prompt.indexOf("The castle.")).toBeGreaterThan(prompt.indexOf(MCP));
    expect(prompt).toContain("spherse:worldbook:after-mcp:start");
  });

  it("inserts position 0 before the MCP sentinel", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["winterfell"], content: "The castle.", position: 0 }]),
    );
    const a = agent(`base\n\n${MCP}`);
    await hooks().beforeTurn!(a);
    const prompt = (a.state as { systemPrompt: string }).systemPrompt;
    expect(prompt.indexOf("The castle.")).toBeLessThan(prompt.indexOf(MCP));
    expect(prompt).toContain("spherse:worldbook:before-mcp:start");
  });

  it("rewrites instead of duplicating on repeated turns, and strips on no hits", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["winterfell"], content: "The castle.", position: 1 }]),
    );
    const h = hooks();
    const a = agent("base");
    await h.beforeTurn!(a);
    await h.beforeTurn!(a);
    const prompt = (a.state as { systemPrompt: string }).systemPrompt;
    expect(prompt.match(/spherse:worldbook:after-mcp:start/g)).toHaveLength(1);
    fs.writeFileSync(path.join(slugDir, "lore.card.json"), cardFile([]));
    invalidateWorldbookCache(root, "hero");
    await h.beforeTurn!(a);
    expect((a.state as { systemPrompt: string }).systemPrompt).not.toContain("<worldbook>");
  });

  it("ignores message-side positions and missing profiles", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["winterfell"], content: "The castle.", position: 3 }]),
    );
    const a = agent("base");
    await hooks().beforeTurn!(a);
    expect((a.state as { systemPrompt: string }).systemPrompt).toBe("base");
    const noProfile = worldbookSystemCapability({
      projectStore: { getRootPath: () => root, getAgent: () => undefined } as never,
    }).turnHooks!("a1", "s1");
    await noProfile.beforeTurn!(a);
    expect((a.state as { systemPrompt: string }).systemPrompt).toBe("base");
  });

  it("warns once for position 2 without a valid depth", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["x"], content: "No depth.", position: 2 }]),
    );
    const warnings: unknown[][] = [];
    const h = hooks({ warn: (...args: unknown[]) => void warnings.push(args) });
    const a = { state: { systemPrompt: "base", messages: [{ role: "user", content: "x" } as never] } } as never;
    await h.beforeTurn!(a);
    await h.beforeTurn!(a);
    expect(warnings).toHaveLength(1);
    expect((a.state as { systemPrompt: string }).systemPrompt).toBe("base");
  });

  it("matches the pending user text that is not yet in state", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([
        { keys: ["winterfell"], content: "The castle.", position: 1 },
        { constant: true, content: "Always.", position: 0 },
      ]),
    );
    const empty = { state: { systemPrompt: "base", messages: [] } } as never;
    await hooks().beforeTurn!(empty, "tell me about winterfell");
    const prompt = (empty.state as { systemPrompt: string }).systemPrompt;
    expect(prompt).toContain("The castle.");
    expect(prompt).toContain("Always.");
    await hooks().beforeTurn!(empty, "talk about baking");
    const rescanned = (empty.state as { systemPrompt: string }).systemPrompt;
    expect(rescanned).not.toContain("The castle.");
    expect(rescanned).toContain("Always.");
  });

  it("appends position 0 at the end when no MCP block exists", async () => {
    fs.writeFileSync(
      path.join(slugDir, "lore.card.json"),
      cardFile([{ keys: ["winterfell"], content: "The castle.", position: 0 }]),
    );
    const a = agent("base");
    await hooks().beforeTurn!(a, "winterfell");
    expect((a.state as { systemPrompt: string }).systemPrompt).toMatch(
      /^base\n\n<!-- spherse:worldbook:before-mcp:start -->/,
    );
  });
});

function canCreateSymlinks(): boolean {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "wb-link-probe-"));
  try {
    fs.symlinkSync(path.join(probe, "t"), path.join(probe, "l"), "file");
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

describe("agent card link validation (no symlinks needed)", () => {
  let root: string;
  let slugDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-card-links-"));
    slugDir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
    fs.mkdirSync(slugDir, { recursive: true });
    invalidateWorldbookCache();
  });

  afterEach(() => {
    invalidateWorldbookCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects traversal and non-card targets", () => {
    expect(() => addAgentCardLink(root, "hero", "../outside.card.json")).toThrow();
    fs.writeFileSync(path.join(root, "lore", "notes.txt"), "plain");
    expect(() => addAgentCardLink(root, "hero", "lore/notes.txt")).toThrow();
    expect(() => addAgentCardLink(root, "hero", "lore/missing.card.json")).toThrow();
  });

  it("remove refuses real files and missing links", () => {
    fs.writeFileSync(path.join(slugDir, "real.card.json"), cardFile([]));
    expect(() => removeAgentCardLink(root, "hero", "real.card.json")).toThrow();
    expect(() => removeAgentCardLink(root, "hero", "ghost.card.json")).toThrow();
    expect(fs.existsSync(path.join(slugDir, "real.card.json"))).toBe(true);
  });

  it("rejects unsafe link names", () => {
    expect(() => removeAgentCardLink(root, "hero", "../x.card.json")).toThrow();
    expect(() => removeAgentCardLink(root, "hero", "sub/x.card.json")).toThrow();
    expect(() => removeAgentCardLink(root, "hero", "x.txt")).toThrow();
  });
});

describe.runIf(canCreateSymlinks())("agent card links", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-card-links-"));
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
    invalidateWorldbookCache();
  });

  afterEach(() => {
    invalidateWorldbookCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function outsideCard(name: string, entries: Partial<CardEntry>[]): string {
    const rel = path.join("lore", name);
    fs.writeFileSync(path.join(root, rel), cardFile(entries));
    return rel;
  }

  it("add/list/remove round-trip", () => {
    const rel = outsideCard("kings.card.json", [{ keys: ["Winterfell"], content: "The castle." }]);
    const added = addAgentCardLink(root, "hero", rel);
    expect(added).toMatchObject({ name: "kings.card.json", dangling: false });
    expect(added.entryCount).toBe(1);
    expect(added.enabledEntryCount).toBe(1);
    expect(added.alwaysTokens).toBe(0);
    expect(added.maxTurnTokens).toBeGreaterThan(0);
    expect(listAgentCardLinks(root, "hero")).toHaveLength(1);
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["The castle."]);
    removeAgentCardLink(root, "hero", "kings.card.json");
    expect(listAgentCardLinks(root, "hero")).toHaveLength(0);
    expect(readAgentWorldbook(root, "hero")).toHaveLength(0);
  });

  it("list reports token stats per link and zeros for dangling", () => {
    const rel = outsideCard("kings.card.json", [
      { keys: ["x"], constant: true, content: "Always on." },
      { keys: ["y"], content: "Sometimes." },
    ]);
    addAgentCardLink(root, "hero", rel);
    const [link] = listAgentCardLinks(root, "hero");
    expect(link).toMatchObject({ entryCount: 2, enabledEntryCount: 2, dangling: false });
    expect(link.alwaysTokens).toBeGreaterThan(0);
    expect(link.maxTurnTokens).toBeGreaterThan(link.alwaysTokens);
    fs.unlinkSync(path.join(root, rel));
    const [dangling] = listAgentCardLinks(root, "hero");
    expect(dangling).toMatchObject({
      dangling: true,
      entryCount: 0,
      enabledEntryCount: 0,
      alwaysTokens: 0,
      maxTurnTokens: 0,
    });
  });

  it("list refreshes token stats after target edits without invalidation", () => {
    const rel = outsideCard("kings.card.json", [{ keys: ["x"], content: "v" }]);
    addAgentCardLink(root, "hero", rel);
    const before = listAgentCardLinks(root, "hero")[0].maxTurnTokens;
    fs.writeFileSync(
      path.join(root, rel),
      cardFile([{ keys: ["x"], content: "v with considerably more content words here" }]),
    );
    const after = listAgentCardLinks(root, "hero")[0];
    expect(after.maxTurnTokens).toBeGreaterThan(before);
  });

  it("add is idempotent for the same target", () => {
    const rel = outsideCard("kings.card.json", [{ keys: ["x"], content: "v" }]);
    addAgentCardLink(root, "hero", rel);
    expect(addAgentCardLink(root, "hero", rel)).toMatchObject({ name: "kings.card.json" });
    expect(listAgentCardLinks(root, "hero")).toHaveLength(1);
  });

  it("reader follows links and sees target edits without invalidation", () => {
    const rel = outsideCard("kings.card.json", [{ keys: ["x"], content: "v1" }]);
    addAgentCardLink(root, "hero", rel);
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["v1"]);
    fs.writeFileSync(path.join(root, rel), cardFile([{ keys: ["x"], content: "v2" }]));
    expect(readAgentWorldbook(root, "hero").map((e) => e.content)).toEqual(["v2"]);
  });

  it("reader skips dangling and outside-project links", () => {
    const rel = outsideCard("kings.card.json", [{ keys: ["x"], content: "v" }]);
    addAgentCardLink(root, "hero", rel);
    fs.unlinkSync(path.join(root, rel));
    expect(readAgentWorldbook(root, "hero")).toHaveLength(0);
    expect(listAgentCardLinks(root, "hero")[0]).toMatchObject({ dangling: true });
  });

  it("add rejects symlink-hop targets escaping the project", () => {
    const hop = path.join("lore", "hop.card.json");
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-card-outside-"));
    try {
      fs.writeFileSync(path.join(outsideDir, "evil.card.json"), cardFile([{ keys: ["x"], content: "evil" }]));
      fs.symlinkSync(path.join(outsideDir, "evil.card.json"), path.join(root, hop), "file");
      expect(() => addAgentCardLink(root, "hero", hop)).toThrow(/escapes project/);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("list marks manually created outside-project links as dangling", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-card-outside-"));
    try {
      fs.writeFileSync(path.join(outsideDir, "evil.card.json"), cardFile([{ keys: ["x"], content: "evil" }]));
      const dir = path.join(root, ".spherse", "agents", "hero");
      fs.mkdirSync(dir, { recursive: true });
      fs.symlinkSync(path.join(outsideDir, "evil.card.json"), path.join(dir, "evil.card.json"), "file");
      expect(listAgentCardLinks(root, "hero")).toMatchObject([{ name: "evil.card.json", dangling: true }]);
      expect(readAgentWorldbook(root, "hero")).toHaveLength(0);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("add conflicts on same name with different target", () => {
    const rel1 = outsideCard("a.card.json", [{ keys: ["x"], content: "v1" }]);
    fs.mkdirSync(path.join(root, "lore2"), { recursive: true });
    fs.writeFileSync(path.join(root, "lore2", "a.card.json"), cardFile([{ keys: ["x"], content: "v2" }]));
    addAgentCardLink(root, "hero", rel1);
    expect(() => addAgentCardLink(root, "hero", path.join("lore2", "a.card.json"))).toThrow(/already exists/);
  });
});
