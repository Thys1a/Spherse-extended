import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ToolAttributionRegistry,
  deriveSideEffects,
} from "../tool-attribution.js";
import { createDataStore } from "../capabilities/data/data-store.js";
import { createCardStore } from "../capabilities/card/card-store.js";
import { FileWriteMutex } from "../utils/file-write-mutex.js";
import { createSilentLogger } from "../logger.js";
import type { DataChangeEvent } from "../capabilities/data/types.js";
import type { CardChangeEvent } from "../capabilities/card/types.js";

describe("ToolAttributionRegistry", () => {
  it("resolves attributions by session and toolCallId, then drops them", () => {
    const registry = new ToolAttributionRegistry();
    expect(registry.attribute("s1", "tc-1")).toBeUndefined();
    registry.begin("s1", "tc-1", { turnSeq: 4 });
    expect(registry.attribute("s1", "tc-1")).toEqual({ turnSeq: 4 });
    registry.drop("s1", "tc-1");
    expect(registry.attribute("s1", "tc-1")).toBeUndefined();
  });

  it("replaces a repeated begin for the same toolCallId", () => {
    const registry = new ToolAttributionRegistry();
    registry.begin("s1", "tc-1", { turnSeq: 1 });
    registry.begin("s1", "tc-1", { turnSeq: 2 });
    expect(registry.attribute("s1", "tc-1")).toEqual({ turnSeq: 2 });
  });

  it("isolates identical toolCallIds across sessions", () => {
    const registry = new ToolAttributionRegistry();
    registry.begin("s1", "call-1", { turnSeq: 1 });
    registry.begin("s2", "call-1", { turnSeq: 7 });
    expect(registry.attribute("s1", "call-1")).toEqual({ turnSeq: 1 });
    expect(registry.attribute("s2", "call-1")).toEqual({ turnSeq: 7 });
    registry.drop("s1", "call-1");
    expect(registry.attribute("s1", "call-1")).toBeUndefined();
    expect(registry.attribute("s2", "call-1")).toEqual({ turnSeq: 7 });
  });

  it("evicts the oldest entries past capacity", () => {
    const registry = new ToolAttributionRegistry();
    for (let i = 0; i < 1025; i++) {
      registry.begin("s", `tc-${i}`, { turnSeq: i });
    }
    expect(registry.attribute("s", "tc-0")).toBeUndefined();
    expect(registry.attribute("s", "tc-1024")).toEqual({ turnSeq: 1024 });
  });
});

describe("deriveSideEffects", () => {
  it("derives data/card/write/edit refs from result details", () => {
    expect(
      deriveSideEffects("mutate_data", { path: "board.data.json", version: "v1" }),
    ).toEqual([{ type: "data", file: "board.data.json", version: "v1" }]);
    expect(deriveSideEffects("edit_card", { path: "lore.card.json" })).toEqual([
      { type: "card", file: "lore.card.json" },
    ]);
    expect(deriveSideEffects("write_file", { path: "notes.txt", size: 3 })).toEqual([
      { type: "write", file: "notes.txt" },
    ]);
    expect(deriveSideEffects("edit_file", { path: "notes.txt", replacements: 1 })).toEqual([
      { type: "edit", file: "notes.txt" },
    ]);
  });

  it("derives memory/trigger refs from ids and names", () => {
    expect(deriveSideEffects("memory_save", { id: 7, tags: [] })).toEqual([
      { type: "memory", file: "7" },
    ]);
    expect(
      deriveSideEffects("emit_trigger_event", { eventName: "daily", firedCount: 1 }),
    ).toEqual([{ type: "trigger", file: "daily" }]);
    expect(
      deriveSideEffects("manage_trigger", { cardType: "manage_trigger", action: "create", triggerId: "t1" }),
    ).toEqual([{ type: "trigger", file: "t1" }]);
  });

  it("covers trigger binding resets and file-writing tools", () => {
    expect(
      deriveSideEffects("manage_trigger", { cardType: "manage_trigger", action: "reset_binding", triggerId: "t9" }),
    ).toEqual([{ type: "trigger", file: "t9" }]);
    expect(
      deriveSideEffects("append_changelog", { agent: "a", action: "create", target: "x" }),
    ).toEqual([{ type: "write", file: "CHANGELOG.md" }]);
    expect(deriveSideEffects("copy_file", { source: "a", destination: "b" })).toEqual([
      { type: "write", file: "b" },
    ]);
    expect(deriveSideEffects("move_file", { source: "a", destination: "b" })).toEqual([
      { type: "write", file: "b" },
    ]);
    expect(deriveSideEffects("generate_image", { path: "img/x.png", status: "done" })).toEqual([
      { type: "write", file: "img/x.png" },
    ]);
  });

  it("ignores failed copies, moves, and generations", () => {
    expect(deriveSideEffects("copy_file", { source: "a", destination: "b", destinationExists: true })).toEqual([]);
    expect(deriveSideEffects("move_file", { source: "a", exists: false })).toEqual([]);
    expect(deriveSideEffects("generate_image", { status: "error", prompt: "p" })).toEqual([]);
  });

  it("ignores error results, unknown tools, and malformed details", () => {
    expect(deriveSideEffects("write_file", { path: "x", denied: true })).toEqual([]);
    expect(deriveSideEffects("write_file", { path: "x", jsonError: true })).toEqual([]);
    expect(deriveSideEffects("emit_trigger_event", { eventName: "x", error: true })).toEqual([]);
    expect(deriveSideEffects("manage_trigger", { cardType: "manage_trigger", action: "list" })).toEqual([]);
    expect(deriveSideEffects("read_data", { path: "x" })).toEqual([]);
    expect(deriveSideEffects("nope", { path: "x" })).toEqual([]);
    expect(deriveSideEffects("mutate_data", null)).toEqual([]);
    expect(deriveSideEffects("mutate_data", { path: 42 })).toEqual([]);
  });

  it("passes valid undo envelopes into data/card refs", () => {
    expect(deriveSideEffects("mutate_data", { path: "b", undo: { op: "set", path: "cfg" } })).toEqual([
      { type: "data", file: "b", undo: { op: "set", path: "cfg" } },
    ]);
    expect(
      deriveSideEffects("edit_card", { path: "lore.card.json", undo: { op: "cardUpdate", path: "entry:3", before: { id: 3 } } }),
    ).toEqual([
      { type: "card", file: "lore.card.json", undo: { op: "cardUpdate", path: "entry:3", before: { id: 3 } } },
    ]);
  });

  it("drops malformed undo envelopes", () => {
    expect(deriveSideEffects("mutate_data", { path: "b", undo: { op: "nuke", path: "x" } })).toEqual([
      { type: "data", file: "b" },
    ]);
    expect(deriveSideEffects("mutate_data", { path: "b", undo: { op: "set" } })).toEqual([
      { type: "data", file: "b" },
    ]);
    expect(deriveSideEffects("mutate_data", { path: "b", undo: 42 })).toEqual([
      { type: "data", file: "b" },
    ]);
  });
});

const BOARD_MANIFEST = {
  version: 1,
  mutations: {
    addTodo: {
      op: "append",
      path: "todos",
      fields: { title: { type: "string", required: true } },
    },
  },
};

function cardJson(): string {
  return JSON.stringify({
    spec: "chara_card_v3",
    spec_version: "3.0",
    name: "lore",
    data: {
      name: "lore",
      extensions: {},
      character_book: {
        name: "lore book",
        entries: [
          {
            id: 0,
            keys: ["k"],
            secondary_keys: [],
            comment: "c0",
            content: "hello",
            constant: false,
            selective: true,
            insertion_order: 1,
            enabled: true,
            position: "after_char",
            use_regex: false,
            extensions: {},
          },
        ],
      },
    },
  });
}

describe("store change events carry turn attribution (R2.5a)", () => {
  let dir: string;
  let registry: ToolAttributionRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "spattr-"));
    registry = new ToolAttributionRegistry();
    await fs.writeFile(
      path.join(dir, "board.data.json"),
      JSON.stringify({ $manifest: BOARD_MANIFEST, todos: [] }),
    );
    await fs.writeFile(path.join(dir, "lore.card.json"), cardJson());
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("data mutate events include sessionId/turnSeq/toolCallId", async () => {
    const store = createDataStore({
      projectRoot: dir,
      fileWriteMutex: new FileWriteMutex(),
      logger: createSilentLogger(),
      attribution: registry,
    });
    const events: DataChangeEvent[] = [];
    store.onChange((e) => events.push(e));
    registry.begin("s1", "tc-1", { turnSeq: 2 });

    await store.mutate("board.data.json", "addTodo", { title: "x" }, { toolCallId: "tc-1", sessionId: "s1" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      file: "board.data.json",
      sessionId: "s1",
      turnSeq: 2,
      toolCallId: "tc-1",
    });
  });

  it("data events omit attribution without a toolCallId", async () => {
    const store = createDataStore({
      projectRoot: dir,
      fileWriteMutex: new FileWriteMutex(),
      logger: createSilentLogger(),
      attribution: registry,
    });
    const events: DataChangeEvent[] = [];
    store.onChange((e) => events.push(e));

    await store.mutate("board.data.json", "addTodo", { title: "x" });

    expect(events).toHaveLength(1);
    expect(events[0].sessionId).toBeUndefined();
    expect(events[0].turnSeq).toBeUndefined();
    expect(events[0].toolCallId).toBeUndefined();
  });

  it("card write events include sessionId/turnSeq/toolCallId", async () => {
    const store = createCardStore({
      projectRoot: dir,
      fileWriteMutex: new FileWriteMutex(),
      logger: createSilentLogger(),
      attribution: registry,
    });
    const events: CardChangeEvent[] = [];
    store.onChange((e) => events.push(e));
    registry.begin("s2", "tc-9", { turnSeq: 5 });

    await store.updateEntry("lore.card.json", 0, { comment: "c0!" }, { toolCallId: "tc-9", sessionId: "s2" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      file: "lore.card.json",
      origin: "agent",
      sessionId: "s2",
      turnSeq: 5,
      toolCallId: "tc-9",
    });
  });
});
