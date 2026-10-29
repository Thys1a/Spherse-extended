import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { ModelCatalog, ValidationError } from "@spherse/core";
import { registerSettingsRoutes } from "../routes/settings.js";

function installValidationErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ValidationError) {
      return reply.code(400).send({ error: err.message });
    }
    return reply.code(500).send({ error: (err as Error).message });
  });
}
import type { ProjectRegistry } from "../registry.js";
import { ModelSettingsStore } from "../model-settings.js";
import { WebSearchSettingsStore } from "../web-search-settings.js";
import { UserSkillSettingsStore } from "../user-skill-settings.js";

function createRegistryMock() {
  return {
    markAllSessionsReloadPending: vi.fn(),
    listInfo: vi.fn().mockReturnValue([]),
  } as unknown as ProjectRegistry;
}

describe("GET /api/settings/skills route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    installValidationErrorHandler(app);
    registerSettingsRoutes(app, createRegistryMock(), {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
      userSkillSettingsStore: new UserSkillSettingsStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns empty custom dirs and the four default sources", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings/skills" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customDirs).toEqual([]);
    expect(body.enabled).toEqual([]);
    expect(body.sources.map((s: { key: string }) => s.key)).toEqual([
      "agents",
      "claude",
      "opencode",
      "codex",
    ]);
    expect(body.sources.every((s: { custom: boolean }) => s.custom === false)).toBe(true);
  });

  it("lists custom sources before the defaults", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-skills-order-"));
    try {
      const store = new UserSkillSettingsStore();
      store.applyUpdate({ customDirs: [tmpDir], enabled: [] });
      const orderApp = Fastify();
      installValidationErrorHandler(orderApp);
      registerSettingsRoutes(orderApp, createRegistryMock(), {
        modelSettingsStore: new ModelSettingsStore(),
        modelCatalog: new ModelCatalog(),
        webSearchSettingsStore: new WebSearchSettingsStore(),
        userSkillSettingsStore: store,
      });
      await orderApp.ready();
      try {
        const res = await orderApp.inject({ method: "GET", url: "/api/settings/skills" });
        expect(res.statusCode).toBe(200);
        const keys = res.json().sources.map((s: { key: string }) => s.key);
        expect(keys[0]).toBe("custom-0");
        expect(keys.slice(1)).toEqual(["agents", "claude", "opencode", "codex"]);
      } finally {
        await orderApp.close();
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("PUT /api/settings/skills route", () => {
  let tmpDir: string;
  let skillRoot: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-skills-routes-"));
    skillRoot = path.join(tmpDir, "skills");
    skillDir = path.join(skillRoot, "demo");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill\n---\n\nDo things.",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists custom dirs and enabled skill dirs and marks sessions for reload", async () => {
    const app = Fastify();
    installValidationErrorHandler(app);
    const store = new UserSkillSettingsStore();
    const registry = createRegistryMock();
    registerSettingsRoutes(app, registry, {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
      userSkillSettingsStore: store,
    });
    await app.ready();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/skills",
        payload: { customDirs: [skillRoot], enabled: [skillDir] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        customDirs: [path.normalize(skillRoot)],
        enabled: [path.normalize(skillDir)],
      });
      expect(store.get().enabled).toEqual([path.normalize(skillDir)]);
      expect(registry.markAllSessionsReloadPending).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("rejects non-array payloads", async () => {
    const app = Fastify();
    installValidationErrorHandler(app);
    registerSettingsRoutes(app, createRegistryMock(), {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
      userSkillSettingsStore: new UserSkillSettingsStore(),
    });
    await app.ready();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/skills",
        payload: { customDirs: [42], enabled: [] },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("rejects relative custom dirs", async () => {
    const app = Fastify();
    installValidationErrorHandler(app);
    registerSettingsRoutes(app, createRegistryMock(), {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
      userSkillSettingsStore: new UserSkillSettingsStore(),
    });
    await app.ready();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/skills",
        payload: { customDirs: ["relative/skills"], enabled: [] },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("rejects custom dirs inside a registered project", async () => {
    const app = Fastify();
    installValidationErrorHandler(app);
    const registry = createRegistryMock();
    (registry.listInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "p1", name: "p1", rootPath: tmpDir },
    ]);
    registerSettingsRoutes(app, registry, {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
      userSkillSettingsStore: new UserSkillSettingsStore(),
    });
    await app.ready();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/skills",
        payload: { customDirs: [skillRoot], enabled: [] },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
