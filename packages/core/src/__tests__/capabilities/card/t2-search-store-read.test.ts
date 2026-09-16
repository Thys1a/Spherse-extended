import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCardStore } from "../../../capabilities/card/card-store.js";
import { searchEntries } from "../../../capabilities/card/search.js";
import { FileWriteMutex } from "../../../utils/file-write-mutex.js";
import { createSilentLogger } from "../../../logger.js";
import {
  CardNotFoundError,
  EntryNotFoundError,
  type CardEntry,
} from "../../../capabilities/card/types.js";

const baseEntry: CardEntry = {
  id: 0,
  keys: ["雷恩", "领主"],
  secondary_keys: [],
  comment: "[角色]雷恩哈特",
  content: "雷恩哈特是北境领主，统御三座城池。",
  constant: false,
  selective: true,
  insertion_order: 95,
  enabled: true,
  position: "after_char",
  use_regex: false,
  extensions: { depth: 4 },
  words: 17,
};

const disabledEntry: CardEntry = {
  ...baseEntry,
  id: 1,
  comment: "[旧]废弃条目",
  keys: ["废弃"],
  content: "雷恩哈特的旧设定",
  enabled: false,
};

const regexEntry: CardEntry = {
  ...baseEntry,
  id: 2,
  comment: "正则条目",
  keys: ["雷恩\\d+"],
  content: "无关",
  use_regex: true,
};

const badRegexEntry: CardEntry = {
  ...baseEntry,
  id: 3,
  comment: "坏正则",
  keys: ["[unclosed"],
  content: "无关",
  use_regex: true,
};

const ENTRIES = [baseEntry, disabledEntry, regexEntry, badRegexEntry];

describe("searchEntries", () => {
  it("matches keys / comment / content tiers", () => {
    const hits = searchEntries(ENTRIES, { query: "雷恩哈特", fields: ["keys", "comment", "content"] });
    expect(hits.map((h) => h.id)).toContain(0);
    const h0 = hits.find((h) => h.id === 0)!;
    expect(h0.matched).toContain("comment");
    expect(h0.matched).toContain("content");
    expect(h0.snippet).toBeDefined();
    expect(h0).not.toHaveProperty("content");
  });

  it("excludes disabled entries by default, includes with onlyEnabled false", () => {
    expect(
      searchEntries(ENTRIES, { query: "废弃", fields: ["keys", "comment"] }),
    ).toHaveLength(0);
    const hits = searchEntries(ENTRIES, {
      query: "废弃",
      fields: ["keys", "comment"],
      onlyEnabled: false,
    });
    expect(hits.map((h) => h.id)).toEqual([1]);
  });

  it("interprets keys as regex for use_regex entries", () => {
    const hits = searchEntries([regexEntry], { query: "雷恩42", fields: ["keys"] });
    expect(hits.map((h) => h.id)).toEqual([2]);
    expect(hits[0].regexFallback).toBeUndefined();
  });

  it("falls back to literal on invalid regex and flags it", () => {
    const hits = searchEntries([badRegexEntry], { query: "[unclosed", fields: ["keys"] });
    expect(hits).toHaveLength(1);
    expect(hits[0].regexFallback).toBe(true);
  });

  it("returns empty on empty query and respects limit", () => {
    expect(searchEntries(ENTRIES, { query: "  " })).toEqual([]);
    const hits = searchEntries(ENTRIES, { query: "雷", fields: ["keys", "comment", "content"], limit: 1 });
    expect(hits).toHaveLength(1);
  });
});

let dir: string;
let store: ReturnType<typeof createCardStore>;

function cardJson(name: string, entries: CardEntry[]): string {
  return JSON.stringify({
    spec: "chara_card_v3",
    spec_version: "3.0",
    name,
    data: {
      name,
      extensions: { regex_scripts: [{}] },
      character_book: { name: `${name} book`, entries },
    },
  });
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "spcard-"));
  await fs.mkdir(path.join(dir, "game"), { recursive: true });
  await fs.mkdir(path.join(dir, "denied"), { recursive: true });
  await fs.writeFile(path.join(dir, "game", "a.card.json"), cardJson("a", [baseEntry, disabledEntry]));
  await fs.writeFile(path.join(dir, "b.card.json"), cardJson("b", [baseEntry]));
  await fs.writeFile(path.join(dir, "denied", "c.card.json"), cardJson("c", [baseEntry]));
  await fs.writeFile(path.join(dir, ".hidden.card.json"), cardJson("h", [baseEntry]));
  await fs.writeFile(path.join(dir, "note.txt"), "x");
  store = createCardStore({
    projectRoot: dir,
    fileWriteMutex: new FileWriteMutex(),
    logger: createSilentLogger(),
    canRead: (rel) => !rel.startsWith("denied/"),
  });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("CardStore reads", () => {
  it("lists card files, skipping denied / dotfiles / non-cards", async () => {
    const items = await store.list();
    expect(items.map((i) => i.path).sort()).toEqual(["b.card.json", "game/a.card.json"]);
    expect(items[0]).toMatchObject({ name: "b", entryCount: 1 });
    expect(items[0].bytes).toBeGreaterThan(0);
  });

  it("lists within a subdir", async () => {
    const items = await store.list("game");
    expect(items.map((i) => i.path)).toEqual(["game/a.card.json"]);
  });

  it("returns meta without content", async () => {
    const meta = await store.meta("game/a.card.json");
    expect(meta).toEqual({
      spec: "chara_card_v3",
      name: "a",
      entryCount: 2,
      enabledCount: 1,
      regexCount: 1,
    });
  });

  it("returns entries without content and applies filters", async () => {
    const all = await store.entries("game/a.card.json");
    expect(all).toHaveLength(2);
    expect(all[0]).not.toHaveProperty("content");
    expect(all[0]).toMatchObject({ id: 0, words: 17 });
    expect(await store.entries("game/a.card.json", { enabled: false })).toHaveLength(1);
    expect(await store.entries("game/a.card.json", { constant: true })).toHaveLength(0);
  });

  it("returns full entries by id", async () => {
    const e = await store.entry("game/a.card.json", 1);
    expect(e.content).toContain("旧设定");
    const many = await store.entryMany("game/a.card.json", [1, 0]);
    expect(many.map((x) => x.id)).toEqual([1, 0]);
  });

  it("throws typed errors for missing card / entry", async () => {
    await expect(store.meta("nope.card.json")).rejects.toBeInstanceOf(CardNotFoundError);
    await expect(store.entry("game/a.card.json", 99)).rejects.toBeInstanceOf(EntryNotFoundError);
    await expect(store.entryMany("game/a.card.json", [0, 99])).rejects.toBeInstanceOf(
      EntryNotFoundError,
    );
  });

  it("searches through the store", async () => {
    const hits = await store.search("game/a.card.json", {
      query: "领主",
      fields: ["keys", "comment", "content"],
    });
    expect(hits.map((h) => h.id)).toEqual([0]);
  });
});
