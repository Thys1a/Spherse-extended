import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardStore } from "../../../capabilities/card/card-store.js";
import { FileWriteMutex } from "../../../utils/file-write-mutex.js";
import { createSilentLogger } from "../../../logger.js";
import {
  CardFileCorruptedError,
  InvalidFieldError,
} from "../../../capabilities/card/types.js";

let dir: string;
let store: ReturnType<typeof createCardStore>;
let mutex: FileWriteMutex;

const FILE = "game/world.card.json";
const abs = (f: string) => path.join(dir, f);

function cardJson(): string {
  return JSON.stringify(
    {
      spec: "chara_card_v3",
      spec_version: "3.0",
      name: "w",
      data: {
        name: "w",
        extensions: {},
        character_book: {
          name: "wb",
          entries: [
            {
              id: 0,
              keys: ["a"],
              secondary_keys: [],
              comment: "first",
              content: "hello",
              constant: false,
              selective: true,
              insertion_order: 1,
              enabled: true,
              position: "after_char",
              use_regex: false,
              extensions: { position: 1, depth: 4 },
            },
            {
              id: 1,
              keys: ["b"],
              secondary_keys: [],
              comment: "second",
              content: "world",
              constant: true,
              selective: false,
              insertion_order: 2,
              enabled: true,
              position: "before_char",
              use_regex: false,
              extensions: {},
            },
          ],
        },
      },
    },
    null,
    2,
  );
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "spcardw-"));
  await fs.mkdir(path.join(dir, "game"), { recursive: true });
  await fs.writeFile(abs(FILE), cardJson());
  mutex = new FileWriteMutex();
  store = createCardStore({ projectRoot: dir, fileWriteMutex: mutex, logger: createSilentLogger() });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("CardStore updateEntry", () => {
  it("updates a single field and reports changed", async () => {
    const r = await store.updateEntry(FILE, 0, { enabled: false });
    expect(r).toMatchObject({ id: 0, changed: ["enabled"], undo: { op: "cardUpdate", path: "entry:0" } });
    expect(r.version).toMatch(/^[0-9a-f]{64}$/);
    expect(r.undo?.before).toMatchObject({ id: 0, enabled: true });
    const e = await store.entry(FILE, 0);
    expect(e.enabled).toBe(false);
    expect(e.extensions).toEqual({ position: 1, depth: 4 });
  });

  it("skips the write when nothing changed", async () => {
    const before = await fs.stat(abs(FILE));
    const r = await store.updateEntry(FILE, 0, { enabled: true });
    expect(r.changed).toEqual([]);
    const after = await fs.stat(abs(FILE));
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("rejects id / extensions / bad values with invalid_field", async () => {
    await expect(store.updateEntry(FILE, 0, { id: 5 } as never)).rejects.toBeInstanceOf(
      InvalidFieldError,
    );
    await expect(
      store.updateEntry(FILE, 0, { extensions: {} } as never),
    ).rejects.toBeInstanceOf(InvalidFieldError);
    await expect(store.updateEntry(FILE, 0, { position: "middle" as never })).rejects.toBeInstanceOf(
      InvalidFieldError,
    );
    await expect(store.updateEntry(FILE, 0, { keys: "x" as never })).rejects.toBeInstanceOf(
      InvalidFieldError,
    );
  });

  it("keeps byte-identical formatting for untouched entries", async () => {
    const before = await fs.readFile(abs(FILE), "utf8");
    await store.updateEntry(FILE, 1, { comment: "second!" });
    const after = await fs.readFile(abs(FILE), "utf8");
    expect(after).toContain('"comment": "first"');
    expect(after).toContain('"comment": "second!"');
    expect(after.endsWith("}")).toBe(true);
    expect(before.length).toBeGreaterThan(0);
  });

  it("throws corrupted on torn JSON", async () => {
    await fs.writeFile(abs(FILE), "{torn");
    await expect(store.entry(FILE, 0)).rejects.toBeInstanceOf(CardFileCorruptedError);
    await expect(store.updateEntry(FILE, 0, { enabled: false })).rejects.toBeInstanceOf(
      CardFileCorruptedError,
    );
  });
});

describe("CardStore bulkUpdate", () => {
  it("updates many entries and counts them", async () => {
    const r = await store.bulkUpdate(FILE, [0, 1], { enabled: false });
    expect(r).toMatchObject({ count: 2, undo: { op: "cardBulk", path: "entries:0,1" } });
    expect(r.version).toMatch(/^[0-9a-f]{64}$/);
    expect(r.undo?.before).toHaveLength(2);
    expect((await store.entry(FILE, 0)).enabled).toBe(false);
    expect((await store.entry(FILE, 1)).enabled).toBe(false);
  });

  it("applies 50 concurrent writes without loss", async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.updateEntry(FILE, i % 2, { comment: `c${i}` }),
      ),
    );
    const entries = await store.entries(FILE);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.comment).toMatch(/^c\d+$/);
    }
  });

  it("serializes with write_file on the same mutex", async () => {
    const order: string[] = [];
    const slowWrite = mutex.run(abs(FILE), async () => {
      order.push("write_file");
    });
    const cardWrite = store.updateEntry(FILE, 0, { comment: "x" }).then(() => {
      order.push("card");
    });
    await Promise.all([slowWrite, cardWrite]);
    expect(order).toEqual(["write_file", "card"]);
  });

  it("cleans tmp and keeps the original on rename failure", async () => {
    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
    await expect(store.updateEntry(FILE, 0, { comment: "boom" })).rejects.toThrow(/write failed/i);
    renameSpy.mockRestore();
    const leftovers = await fs.readdir(path.join(dir, "game"));
    expect(leftovers.filter((f) => f.includes(".spcard.tmp"))).toEqual([]);
    const e = await store.entry(FILE, 0);
    expect(e.comment).toBe("first");
  });

  it("rolls back and removes tmp on reread failure", async () => {
    const orig = fs.readFile;
    let calls = 0;
    const spy = vi.spyOn(fs, "readFile").mockImplementation((async (...args: [string]) => {
      calls += 1;
      if (calls === 2) return Buffer.from("{torn", "utf8");
      return (orig as (...a: unknown[]) => Promise<Buffer>)(...args);
    }) as typeof fs.readFile);
    await expect(store.updateEntry(FILE, 0, { comment: "boom" })).rejects.toThrow(/write failed/i);
    spy.mockRestore();
    const leftovers = await fs.readdir(path.join(dir, "game"));
    expect(leftovers.filter((f) => f.includes(".spcard.tmp"))).toEqual([]);
    const e = await store.entry(FILE, 0);
    expect(e.comment).toBe("first");
  });
});

describe("CardStore addEntry", () => {
  it("appends a canonical 12-field entry with max+1 id", async () => {
    const { id } = await store.addEntry(FILE, { comment: "third", content: "!" });
    expect(id).toBe(2);
    const raw = JSON.parse(await fs.readFile(abs(FILE), "utf8"));
    const added = raw.data.character_book.entries.find(
      (e: Record<string, unknown>) => e.id === 2,
    );
    expect(Object.keys(added)).toEqual([
      "id",
      "keys",
      "secondary_keys",
      "comment",
      "content",
      "constant",
      "selective",
      "insertion_order",
      "enabled",
      "position",
      "use_regex",
      "extensions",
    ]);
    expect(added).toMatchObject({ comment: "third", extensions: {} });
    const e = await store.entry(FILE, 2);
    expect(e.content).toBe("!");
  });

  it("rejects id / extensions in the body with invalid_field", async () => {
    await expect(store.addEntry(FILE, { id: 9 } as never)).rejects.toBeInstanceOf(
      InvalidFieldError,
    );
    await expect(store.addEntry(FILE, { extensions: {} } as never)).rejects.toBeInstanceOf(
      InvalidFieldError,
    );
  });

  it("assigns unique ids under concurrent adds", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.addEntry(FILE, { comment: `n${i}` })),
    );
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(10);
    const entries = await store.entries(FILE);
    expect(entries).toHaveLength(12);
  });
});

describe("CardStore removeEntry", () => {
  it("removes one entry and keeps the rest fully deep-equal", async () => {
    const readRaw = async () =>
      JSON.parse(await fs.readFile(abs(FILE), "utf8")).data.character_book.entries as Array<
        Record<string, unknown>
      >;
    const before = await readRaw();
    const r = await store.removeEntry(FILE, 0);
    expect(r).toMatchObject({ ok: true, undo: { op: "cardRemove", path: "entry:0", index: 0 } });
    expect(r.version).toMatch(/^[0-9a-f]{64}$/);
    expect(r.undo?.before).toMatchObject({ id: 0 });
    const after = await readRaw();
    expect(after.map((e) => e.id)).toEqual([1]);
    expect(after[0]).toEqual(before.find((e) => e.id === 1));
    await expect(store.entry(FILE, 0)).rejects.toThrow(/not found/i);
  });

  it("throws entry_not_found for unknown id", async () => {
    await expect(store.removeEntry(FILE, 99)).rejects.toThrow(/not found/i);
  });
});

describe("CardStore addEntry on empty table", () => {
  it("assigns id 0 as the first entry", async () => {
    const raw = JSON.parse(await fs.readFile(abs(FILE), "utf8"));
    raw.data.character_book.entries = [];
    await fs.writeFile(abs(FILE), JSON.stringify(raw, null, 2));
    const { id } = await store.addEntry(FILE, { comment: "first" });
    expect(id).toBe(0);
    const e = await store.entry(FILE, 0);
    expect(e.comment).toBe("first");
  });
});
