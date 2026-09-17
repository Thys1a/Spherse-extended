import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardCapability } from "../../../capabilities/card/capability.js";
import { createCardStore } from "../../../capabilities/card/card-store.js";
import { FileWriteMutex } from "../../../utils/file-write-mutex.js";
import { createSilentLogger } from "../../../logger.js";
import type { ToolHost } from "../../../kernel/ports.js";

let dir: string;
let mutex: FileWriteMutex;

const FILE = "game/world.card.json";

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
              keys: ["alpha"],
              secondary_keys: [],
              comment: "first",
              content: "alpha beta",
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
    },
    null,
    2,
  );
}

function makeHost(deniedPaths: string[] = []): ToolHost {
  return {
    agentId: "a1",
    sessionId: "s1",
    profile: {} as ToolHost["profile"],
    projectRoot: dir,
    projectStore: {
      getRootPath: () => dir,
      config: { getAiAccessSettings: () => ({ deniedPaths }) },
    } as unknown as ToolHost["projectStore"],
    fileWriteMutex: mutex,
    logger: createSilentLogger(),
    stores: { register: () => {}, get: () => undefined, forAgent: () => ({}), clearAgent: () => {} },
    pathRules: [],
    toolCatalog: { names: [] },
  };
}

type Exec = (
  id: string,
  params: Record<string, unknown>,
) => Promise<{ content: { type: string; text: string }[]; details?: unknown }>;

function getTool(host: ToolHost, name: string): { execute: Exec } {
  const tools = cardCapability().tools!(host);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool as unknown as { execute: Exec };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "spcardt-"));
  await fs.mkdir(path.join(dir, "game"), { recursive: true });
  await fs.writeFile(path.join(dir, FILE), cardJson());
  mutex = new FileWriteMutex();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("cardCapability assembly", () => {
  it("registers 3 tools", () => {
    const tools = cardCapability().tools!(makeHost());
    expect(tools.map((t) => t.name).sort()).toEqual(["edit_card", "read_card", "search_card"]);
  });

  it("uses the shared CardStore instance", async () => {
    const shared = createCardStore({
      projectRoot: dir,
      fileWriteMutex: mutex,
      logger: createSilentLogger(),
    });
    const tools = cardCapability(shared).tools!(makeHost());
    const edit = tools.find((t) => t.name === "edit_card") as unknown as { execute: Exec };
    const r = await edit.execute("t1", {
      action: "update",
      file: FILE,
      id: 0,
      patch: { comment: "renamed" },
    });
    expect(r.content[0].text).toContain("comment");
    const viaShared = await shared.entry(FILE, 0);
    expect(viaShared.comment).toBe("renamed");
  });
});

describe("card tools behavior", () => {
  it("read_card meta/entries/entry round-trip as JSON text", async () => {
    const read = getTool(makeHost(), "read_card");
    const meta = await read.execute("t1", { action: "meta", file: FILE });
    expect(meta.content[0].text).toContain("chara_card_v3");
    const entries = await read.execute("t2", { action: "entries", file: FILE });
    expect(entries.content[0].text).toContain("first");
    expect(entries.content[0].text).not.toContain("alpha beta");
    const entry = await read.execute("t3", { action: "entry", file: FILE, id: 0 });
    expect(entry.content[0].text).toContain("alpha beta");
  });

  it("search_card finds by keys", async () => {
    const search = getTool(makeHost(), "search_card");
    const r = await search.execute("t1", { file: FILE, query: "alpha", fields: ["keys"] });
    expect(r.content[0].text).toContain("first");
  });

  it("edit_card update/bulk/add/remove persist to disk", async () => {
    const edit = getTool(makeHost(), "edit_card");
    const u = await edit.execute("t1", {
      action: "update",
      file: FILE,
      id: 0,
      patch: { enabled: false },
    });
    expect(u.content[0].text).toContain("enabled");
    const b = await edit.execute("t2", {
      action: "bulk",
      file: FILE,
      ids: [0],
      patch: { enabled: true },
    });
    expect(b.content[0].text).toContain("1");
    const a = await edit.execute("t3", {
      action: "add",
      file: FILE,
      entry: { comment: "n", content: "c" },
    });
    expect(a.content[0].text).toContain('"id": 1');
    const d = await edit.execute("t4", { action: "remove", file: FILE, id: 1 });
    expect(d.content[0].text).toContain("true");
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, FILE), "utf8"));
    expect(onDisk.data.character_book.entries).toHaveLength(1);
  });

  it("edit_card rejects bad fields with invalid_field text", async () => {
    const edit = getTool(makeHost(), "edit_card");
    const r = await edit.execute("t1", {
      action: "update",
      file: FILE,
      id: 0,
      patch: { id: 9 },
    });
    expect(r.content[0].text).toMatch(/invalid field/i);
  });

  it("denies reads/writes outside the read/write policy", async () => {
    const host = makeHost([FILE]);
    const read = getTool(host, "read_card");
    const r = await read.execute("t1", { action: "meta", file: FILE });
    expect(r.content[0].text.length).toBeGreaterThan(0);
    expect(r.details).toMatchObject({ denied: true });
    const edit = getTool(host, "edit_card");
    const w = await edit.execute("t2", { action: "update", file: FILE, id: 0, patch: {} });
    expect(w.details).toMatchObject({ denied: true });
  });

  it("read_card list succeeds and hides denied files", async () => {
    const read = getTool(makeHost(), "read_card");
    const r = await read.execute("t1", { action: "list" });
    expect(r.content[0].text).toContain("world.card.json");
    const deniedHost = makeHost(["game/world.card.json"]);
    const deniedRead = getTool(deniedHost, "read_card");
    const d = await deniedRead.execute("t2", { action: "list" });
    expect(d.content[0].text).not.toContain("world.card.json");
  });

  it("search_card is denied outside the read policy", async () => {
    const host = makeHost([FILE]);
    const search = getTool(host, "search_card");
    const r = await search.execute("t1", { file: FILE, query: "alpha" });
    expect(r.details).toMatchObject({ denied: true });
  });

  it("edit_card add rejects bad entry body without writing", async () => {
    const before = await fs.readFile(path.join(dir, FILE));
    const edit = getTool(makeHost(), "edit_card");
    const r = await edit.execute("t1", { action: "add", file: FILE, entry: { id: 9 } });
    expect(r.content[0].text).toMatch(/invalid field/i);
    expect(r.details).toMatchObject({ error: true });
    expect(await fs.readFile(path.join(dir, FILE))).toEqual(before);
  });

  it("edit_card requires per-action params and writes nothing", async () => {
    const before = await fs.readFile(path.join(dir, FILE));
    const edit = getTool(makeHost(), "edit_card");
    const noEntry = await edit.execute("t1", { action: "add", file: FILE });
    expect(noEntry.content[0].text).toMatch(/entry is required/);
    const noIds = await edit.execute("t2", { action: "bulk", file: FILE, patch: {} });
    expect(noIds.content[0].text).toMatch(/ids is required/);
    const noId = await edit.execute("t3", { action: "remove", file: FILE });
    expect(noId.content[0].text).toMatch(/id is required/);
    expect(await fs.readFile(path.join(dir, FILE))).toEqual(before);
  });
});
