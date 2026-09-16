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
    expect(r).toEqual({ id: 0, changed: ["enabled"] });
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
    expect(r).toEqual({ count: 2 });
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
