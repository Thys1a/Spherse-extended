import { describe, expect, it } from "vitest";
import { resolveCardFile } from "../../../capabilities/card/path-guard.js";
import { parseCardBytes, toParsedCard } from "../../../capabilities/card/parser.js";
import { CardCache } from "../../../capabilities/card/cache.js";

function cardDoc(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      name: "test",
      data: {
        name: "test",
        extensions: { regex_scripts: [{}, {}] },
        character_book: {
          name: "test book",
          entries: [
            {
              id: 0,
              keys: ["a"],
              secondary_keys: [],
              comment: "first",
              content: "hello world",
              constant: false,
              selective: true,
              insertion_order: 5,
              enabled: true,
              position: "after_char",
              use_regex: false,
              extensions: { depth: 4 },
            },
            ...((overrides.extraEntries ?? []) as unknown[]),
          ],
        },
      },
    }),
    "utf8",
  );
}

describe("resolveCardFile", () => {
  const root = "C:\\proj";
  it("accepts .card.json inside the project", () => {
    const abs = resolveCardFile(root, "game/world.card.json");
    expect(abs.endsWith("world.card.json")).toBe(true);
  });

  it("rejects non-card json, .spherse and traversal", () => {
    expect(() => resolveCardFile(root, "game/world.data.json")).toThrow(/\.card\.json/);
    expect(() => resolveCardFile(root, ".spherse/a.card.json")).toThrow(/\.spherse/);
    expect(() => resolveCardFile(root, "game/.spherse/nested.card.json")).toThrow(/\.spherse/);
    expect(() => resolveCardFile(root, "game/.Spherse/nested.card.json")).toThrow(/\.spherse/);
    expect(() => resolveCardFile(root, "../evil.card.json")).toThrow();
  });
});

describe("parseCardBytes", () => {
  it("extracts entries with summary fields", () => {
    const parsed = parseCardBytes(cardDoc());
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("test");
    expect(parsed!.regexCount).toBe(2);
    expect(parsed!.entries).toHaveLength(1);
    expect(parsed!.entries[0]).toMatchObject({
      id: 0,
      comment: "first",
      keys: ["a"],
      enabled: true,
      position: "after_char",
      insertion_order: 5,
      words: 11,
    });
  });

  it("returns null for torn JSON or missing character_book", () => {
    expect(parseCardBytes(Buffer.from("{broken", "utf8"))).toBeNull();
    expect(parseCardBytes(Buffer.from(JSON.stringify({ spec: "x" }), "utf8"))).toBeNull();
    expect(toParsedCard(Buffer.from("{broken", "utf8"))).toBeNull();
  });

  it("skips malformed entries but keeps valid ones", () => {
    const parsed = parseCardBytes(cardDoc({ extraEntries: [{ nope: true }, "str"] }));
    expect(parsed!.entries).toHaveLength(1);
  });
});

describe("CardCache", () => {
  it("hits on same hash, misses on changed content, evicts by bytes", () => {
    const cache = new CardCache(40);
    const buf = cardDoc();
    const card = toParsedCard(buf)!;
    expect(cache.get("a", "h1")).toBeUndefined();
    cache.set("a", "h1", card);
    expect(cache.get("a", "h1")).toBe(card);
    expect(cache.get("a", "h2")).toBeUndefined();
    cache.set("b", "h2", { ...card, bytes: 1000 });
    expect(cache.get("a", "h1")).toBeUndefined();
    expect(cache.get("b", "h2")?.bytes).toBe(1000);
  });

  it("invalidates one file only", () => {
    const cache = new CardCache();
    const card = toParsedCard(cardDoc())!;
    cache.set("a", "h", card);
    cache.set("b", "h", card);
    cache.invalidateFile("a");
    expect(cache.get("a", "h")).toBeUndefined();
    expect(cache.get("b", "h")).toBe(card);
  });
});
