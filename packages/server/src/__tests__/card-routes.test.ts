import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { createCardStore, FileWriteMutex } from "@spherse/core";
import { registerCardRoutes } from "../routes/card.js";
import type { ProjectRegistry } from "../registry.js";
import { createSilentLoggerForTests } from "./test-logger.js";

function cardJson(name: string): string {
  return JSON.stringify(
    {
      spec: "chara_card_v3",
      spec_version: "3.0",
      name,
      data: {
        name,
        extensions: { regex_scripts: [{}] },
        character_book: {
          name: `${name} book`,
          entries: [
            {
              id: 0,
              keys: ["alpha"],
              secondary_keys: [],
              comment: "first",
              content: "alpha beta gamma",
              constant: false,
              selective: true,
              insertion_order: 1,
              enabled: true,
              position: "after_char",
              use_regex: false,
              extensions: {},
            },
            {
              id: 1,
              keys: ["delta"],
              secondary_keys: [],
              comment: "second",
              content: "delta content",
              constant: true,
              selective: false,
              insertion_order: 2,
              enabled: false,
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

function makeRegistry(root: string): ProjectRegistry {
  const cardStore = createCardStore({
    projectRoot: root,
    fileWriteMutex: new FileWriteMutex(),
    logger: createSilentLoggerForTests(),
  });
  return { get: () => ({ runtime: { cardStore } }) } as unknown as ProjectRegistry;
}

describe("card routes (real CardStore, no mocks)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  const FILE = "game/world.card.json";

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-card-"));
    fs.mkdirSync(path.join(tmpDir, "game"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, FILE), cardJson("w"));
    fs.writeFileSync(path.join(tmpDir, "broken.card.json"), "{half");
    app = Fastify();
    app.addHook("preHandler", async (req) => {
      (req as unknown as { projectCtx: unknown }).projectCtx = {
        projectManager: { getRootPath: () => tmpDir },
      };
    });
    registerCardRoutes(app, makeRegistry(tmpDir));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("list/meta/entries round-trip without content", async () => {
    const list = await app.inject({ method: "POST", url: "/api/projects/p1/card/list", payload: {} });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).map((i: { path: string }) => i.path)).toEqual([FILE]);
    const meta = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/meta",
      payload: { path: FILE },
    });
    expect(JSON.parse(meta.body)).toEqual({
      spec: "chara_card_v3",
      name: "w",
      entryCount: 2,
      enabledCount: 1,
      regexCount: 1,
    });
    const entries = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entries",
      payload: { path: FILE, filter: { enabled: true } },
    });
    expect(JSON.parse(entries.body)).toHaveLength(1);
    expect(JSON.parse(entries.body)[0]).not.toHaveProperty("content");
  });

  it("search/entry/many return expected shapes", async () => {
    const search = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/search",
      payload: { path: FILE, query: "alpha", fields: ["keys", "content"] },
    });
    expect(search.statusCode).toBe(200);
    const body = JSON.parse(search.body);
    expect(body.total).toBe(1);
    expect(body.results[0]).toMatchObject({ id: 0, matched: ["keys", "content"] });
    const entry = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry",
      payload: { path: FILE, id: 1 },
    });
    expect(JSON.parse(entry.body).content).toBe("delta content");
  });

  it("update persists to disk and reports changed", async () => {
    const update = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry/update",
      payload: { path: FILE, id: 0, patch: { enabled: false } },
    });
    expect(update.statusCode).toBe(200);
    expect(JSON.parse(update.body)).toEqual({ id: 0, changed: ["enabled"] });
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, FILE), "utf8"));
    expect(onDisk.data.character_book.entries[0].enabled).toBe(false);
    const bulk = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry/bulk",
      payload: { path: FILE, ids: [0, 1], patch: { enabled: true } },
    });
    expect(JSON.parse(bulk.body)).toEqual({ count: 2 });
  });

  it("400 on schema violation, 404 on missing entry", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/meta",
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
    const field = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry/update",
      payload: { path: FILE, id: 0, patch: { position: "middle_earth" } },
    });
    expect(field.statusCode).toBe(400);
    const unknown = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry/update",
      payload: { path: FILE, id: 0, patch: { id: 9 } },
    });
    expect(unknown.statusCode).toBe(200);
    expect(JSON.parse(unknown.body)).toEqual({ id: 0, changed: [] });
    const missing = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/entry",
      payload: { path: FILE, id: 99 },
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body).code).toBe("entry_not_found");
  });

  it("422 on corrupted file, 403 inside .spherse", async () => {
    const broken = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/meta",
      payload: { path: "broken.card.json" },
    });
    expect(broken.statusCode).toBe(422);
    expect(JSON.parse(broken.body).code).toBe("invalid_json");
    const denied = await app.inject({
      method: "POST",
      url: "/api/projects/p1/card/meta",
      payload: { path: ".spherse/x.card.json" },
    });
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body).code).toBe("forbidden");
  });
});
