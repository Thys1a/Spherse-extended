import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataStore } from "../capabilities/data/data-store.js";
import { createCardStore } from "../capabilities/card/card-store.js";
import { createRollbackTurnTool } from "../capabilities/rollback/tools.js";
import { FileWriteMutex } from "../utils/file-write-mutex.js";
import { createSilentLogger } from "../logger.js";
import { TURN_SIDE_EFFECTS_STORE_KEY, type SideEffectRef, type UndoRecord } from "../tool-attribution.js";
import { createStoreRegistry } from "../kernel/ports.js";
import { permissivePolicy } from "./helpers.js";

const DATA_MANIFEST = {
  version: 2,
  mutations: {
    addMember: {
      op: "append",
      path: "party",
      fields: {
        name: { type: "string", required: true },
        stats: { type: "object", required: true, properties: { hp: { type: "integer", required: true } } },
      },
      auto: { id: "uuid" },
    },
    setHp: {
      op: "update",
      path: "party",
      match: "name",
      fields: { stats: { type: "object", properties: { hp: { type: "integer", required: true } } } },
    },
    dropMember: { op: "remove", path: "party", match: "name" },
    setConfig: {
      op: "set",
      path: "config",
      fields: { audio: { type: "object", properties: { volume: { type: "integer" } } } },
    },
  },
};

const DATA_FILE = "party.data.json";

function dataDoc() {
  return { $manifest: DATA_MANIFEST, party: [], config: { audio: { volume: 50 } } };
}

describe("data rollbackUndo", () => {
  let dir: string;
  let store: ReturnType<typeof createDataStore>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "rb-data-"));
    store = createDataStore({ projectRoot: dir, fileWriteMutex: new FileWriteMutex(), logger: createSilentLogger() });
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify(dataDoc(), null, 2));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function readDoc(): Promise<any> {
    return JSON.parse(await fs.readFile(path.join(dir, DATA_FILE), "utf8"));
  }

  it("restores an appended row and supports re-rollback", async () => {
    const w = await store.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    expect((await readDoc()).party).toHaveLength(1);
    const undo = w.undo as UndoRecord;
    expect(undo.op).toBe("append");

    const r1 = await store.rollbackUndo(DATA_FILE, undo, w.version);
    expect((await readDoc()).party).toEqual([]);
    expect(r1.version).not.toBe(w.version);
    expect(r1.undo?.op).toBe("remove");

    const r2 = await store.rollbackUndo(DATA_FILE, r1.undo as UndoRecord, r1.version);
    expect((await readDoc()).party).toHaveLength(1);
    expect(r2.undo?.op).toBe("append");
  });

  it("restores an updated row", async () => {
    await store.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    const w = await store.mutate(DATA_FILE, "setHp", { name: "ash", stats: { hp: 10 } });
    expect((await readDoc()).party[0].stats.hp).toBe(10);
    await store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version);
    expect((await readDoc()).party[0].stats).toEqual({ hp: 80 });
  });

  it("reinserts a removed row at its index", async () => {
    await store.mutate(DATA_FILE, "addMember", { name: "a", stats: { hp: 1 } });
    await store.mutate(DATA_FILE, "addMember", { name: "b", stats: { hp: 2 } });
    const w = await store.mutate(DATA_FILE, "dropMember", { name: "a" });
    expect((await readDoc()).party.map((m: any) => m.name)).toEqual(["b"]);
    await store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version);
    expect((await readDoc()).party.map((m: any) => m.name)).toEqual(["a", "b"]);
  });

  it("restores a set leaf and deletes keys created by set", async () => {
    const w = await store.mutate(DATA_FILE, "setConfig", { audio: { volume: 7 } });
    expect((await readDoc()).config).toEqual({ audio: { volume: 7 } });
    await store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version);
    expect((await readDoc()).config).toEqual({ audio: { volume: 50 } });
  });

  it("rolls back rawSet and rawDelete", async () => {
    const w1 = await store.rawSet(DATA_FILE, "note", "hi");
    expect((await readDoc()).note).toBe("hi");
    await store.rollbackUndo(DATA_FILE, w1.undo as UndoRecord, w1.version);
    expect("note" in (await readDoc())).toBe(false);

    await store.rawSet(DATA_FILE, "note", "again");
    const w2 = await store.rawDelete(DATA_FILE, "note");
    expect("note" in (await readDoc())).toBe(false);
    await store.rollbackUndo(DATA_FILE, w2.undo as UndoRecord, w2.version);
    expect((await readDoc()).note).toBe("again");
  });

  it("refuses on version conflict", async () => {
    const w = await store.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    await store.rawSet(DATA_FILE, "note", "interleaved");
    await expect(store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version)).rejects.toThrow(/version conflict/);
    expect((await readDoc()).party).toHaveLength(1);
  });

  it("returns cached result for a repeated idempotency key", async () => {
    const w = await store.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    const key = "rollback:tc-1";
    const r1 = await store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version, { idempotencyKey: key, toolCallId: "tc-1", sessionId: "s1" });
    const r2 = await store.rollbackUndo(DATA_FILE, w.undo as UndoRecord, w.version, { idempotencyKey: key, toolCallId: "tc-1", sessionId: "s1" });
    expect(r2.version).toBe(r1.version);
    expect((await readDoc()).party).toEqual([]);
  });
});


const CARD_FILE = "game/world.card.json";

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
              id: 0, keys: ["a"], secondary_keys: [], comment: "first", content: "hello",
              constant: false, selective: false, insertion_order: 1, enabled: true,
              position: "after_char", use_regex: false, extensions: {},
            },
            {
              id: 1, keys: ["b"], secondary_keys: [], comment: "second", content: "world",
              constant: false, selective: false, insertion_order: 2, enabled: true,
              position: "after_char", use_regex: false, extensions: {},
            },
          ],
        },
      },
    },
    null,
    2,
  );
}

describe("card rollbackUndo", () => {
  let dir: string;
  let store: ReturnType<typeof createCardStore>;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "rb-card-"));
    await fs.mkdir(path.join(dir, "game"), { recursive: true });
    await fs.writeFile(path.join(dir, CARD_FILE), cardJson());
    store = createCardStore({ projectRoot: dir, fileWriteMutex: new FileWriteMutex(), logger: createSilentLogger() });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("restores an updated entry", async () => {
    const w = await store.updateEntry(CARD_FILE, 0, { comment: "changed" });
    expect((await store.entry(CARD_FILE, 0)).comment).toBe("changed");
    await store.rollbackUndo(CARD_FILE, w.undo as UndoRecord, w.version);
    expect((await store.entry(CARD_FILE, 0)).comment).toBe("first");
  });

  it("restores bulk-updated entries", async () => {
    const w = await store.bulkUpdate(CARD_FILE, [0, 1], { enabled: false });
    expect((await store.entry(CARD_FILE, 0)).enabled).toBe(false);
    await store.rollbackUndo(CARD_FILE, w.undo as UndoRecord, w.version);
    expect((await store.entry(CARD_FILE, 0)).enabled).toBe(true);
    expect((await store.entry(CARD_FILE, 1)).enabled).toBe(true);
  });

  it("removes an added entry by id", async () => {
    const w = await store.addEntry(CARD_FILE, { comment: "third" });
    expect((await store.entry(CARD_FILE, w.id)).comment).toBe("third");
    await store.rollbackUndo(CARD_FILE, w.undo as UndoRecord, w.version);
    await expect(store.entry(CARD_FILE, w.id)).rejects.toThrow(/not found/i);
  });

  it("reinserts a removed entry with its id", async () => {
    const w = await store.removeEntry(CARD_FILE, 0);
    await expect(store.entry(CARD_FILE, 0)).rejects.toThrow(/not found/i);
    await store.rollbackUndo(CARD_FILE, w.undo as UndoRecord, w.version);
    const restored = await store.entry(CARD_FILE, 0);
    expect(restored.comment).toBe("first");
  });

  it("refuses on version conflict", async () => {
    const w = await store.updateEntry(CARD_FILE, 0, { comment: "changed" });
    await store.updateEntry(CARD_FILE, 1, { comment: "interleaved" });
    await expect(store.rollbackUndo(CARD_FILE, w.undo as UndoRecord, w.version)).rejects.toThrow(/version conflict/);
    expect((await store.entry(CARD_FILE, 0)).comment).toBe("changed");
  });
});

describe("rollback_turn tool", () => {  let dir: string;
  let dataStore: ReturnType<typeof createDataStore>;
  let cardStore: ReturnType<typeof createCardStore>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "rb-tool-"));
    dataStore = createDataStore({ projectRoot: dir, fileWriteMutex: new FileWriteMutex(), logger: createSilentLogger() });
    cardStore = createCardStore({ projectRoot: dir, fileWriteMutex: new FileWriteMutex(), logger: createSilentLogger() });
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify(dataDoc(), null, 2));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function makeTool(refs: SideEffectRef[], denyFile?: string) {
    const source = { listSideEffectsByTurn: (_sid: string, _seq: number) => refs };
    const stores = createStoreRegistry(createSilentLogger());
    stores.register(TURN_SIDE_EFFECTS_STORE_KEY, source);
    const getPolicy = denyFile
      ? () => ({
          assertRead: () => {},
          assertWrite: (rel: string) => {
            if (rel === denyFile) throw new Error("denied: " + rel);
          },
          canRead: () => true,
          canWrite: () => true,
        })
      : permissivePolicy(dir);
    return createRollbackTurnTool({ dataStore, cardStore, stores, sessionId: "s1", getPolicy });
  }

  async function readDoc(): Promise<any> {
    return JSON.parse(await fs.readFile(path.join(dir, DATA_FILE), "utf8"));
  }

  function textOf(result: { content: Array<{ text: string }> }): string {
    return result.content[0].text;
  }
  it("rolls back a turn data write end to end", async () => {
    const w = await dataStore.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    const tool = makeTool([{ type: "data", file: DATA_FILE, version: w.version, undo: w.undo }]);
    const res = await tool.execute("tc-rb-1", { turnSeq: 4 });
    expect(textOf(res)).toContain("1 undone");
    expect(await readDoc().then((d) => d.party)).toEqual([]);
  });

  it("reports turns without recorded side effects", async () => {
    const tool = makeTool([]);
    const res = await tool.execute("tc-rb-2", { turnSeq: 9 });
    expect(textOf(res)).toContain("No recorded side effects");
    expect(textOf(res)).toContain("0 undone");
  });

  it("marks conflicted writes for manual handling", async () => {
    const w = await dataStore.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    await dataStore.rawSet(DATA_FILE, "note", "interleaved");
    const tool = makeTool([{ type: "data", file: DATA_FILE, version: w.version, undo: w.undo }]);
    const res = await tool.execute("tc-rb-3", { turnSeq: 4 });
    expect(textOf(res)).toContain("0 undone, 1 skipped");
    expect(textOf(res)).toContain("manual");
    expect((await readDoc()).party).toHaveLength(1);
  });

  it("skips non-rollbackable refs", async () => {
    const tool = makeTool([{ type: "write", file: "notes.txt" }]);
    const res = await tool.execute("tc-rb-4", { turnSeq: 4 });
    expect(textOf(res)).toContain("0 undone, 1 skipped");
  });

  it("fails writes denied by policy", async () => {
    const w = await dataStore.mutate(DATA_FILE, "addMember", { name: "ash", stats: { hp: 80 } });
    const tool = makeTool([{ type: "data", file: DATA_FILE, version: w.version, undo: w.undo }], DATA_FILE);
    const res = await tool.execute("tc-rb-5", { turnSeq: 4 });
    expect(textOf(res)).toContain("0 undone, 0 skipped, 1 failed");
  });
});
