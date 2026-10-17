import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { ModelCatalog } from "@spherse/core";
import { registerSettingsRoutes } from "../routes/settings.js";
import type { ProjectRegistry } from "../registry.js";
import { ModelSettingsStore } from "../model-settings.js";

describe("GET /api/settings/models route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerSettingsRoutes(app, {} as ProjectRegistry, {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns sanitized empty defaults without a file", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings/models" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      models: {
        text: { defaultModel: "", providers: {} },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [],
    });
  });

  it("never exposes plaintext keys", async () => {
    const store = new ModelSettingsStore();
    store.applyUpdate({
      models: {
        text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-secret" } } },
        image: { defaultModel: "", providers: {} },
      },
    });
    const gated = Fastify();
    registerSettingsRoutes(gated, {} as ProjectRegistry, {
      modelSettingsStore: store,
      modelCatalog: new ModelCatalog(),
    });
    await gated.ready();
    try {
      const res = await gated.inject({ method: "GET", url: "/api/settings/models" });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain("sk-secret");
      expect(res.json()).toEqual({
        models: {
          text: { defaultModel: "openai/gpt-4o", providers: { openai: { configured: true } } },
          image: { defaultModel: "", providers: {} },
        },
        customProviders: [],
      });
    } finally {
      await gated.close();
    }
  });

  it("serves seeded file content through sanitize", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-model-seed-"));
    try {
      const filePath = path.join(dir, "model-settings.json");
      const store = new ModelSettingsStore({ filePath });
      store.applyUpdate({
        models: {
          text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-1" } } },
          image: { defaultModel: "", providers: {} },
        },
      });
      const reloaded = new ModelSettingsStore({ filePath });
      const seeded = Fastify();
      registerSettingsRoutes(seeded, {} as ProjectRegistry, {
        modelSettingsStore: reloaded,
        modelCatalog: new ModelCatalog(),
      });
      await seeded.ready();
      try {
        const res = await seeded.inject({ method: "GET", url: "/api/settings/models" });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          models: {
            text: { defaultModel: "openai/gpt-4o", providers: { openai: { configured: true } } },
            image: { defaultModel: "", providers: {} },
          },
          customProviders: [],
        });
      } finally {
        await seeded.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rotates keys, deletes on blank and syncs the registry on PUT", async () => {
    const savedEnv = process.env.OPENAI_API_KEY;
    const store = new ModelSettingsStore();
    const registry = {
      setDefaultModel: vi.fn(),
      setSampling: vi.fn(),
      setThinkingLevel: vi.fn(),
    };
    const writable = Fastify();
    registerSettingsRoutes(writable, registry as unknown as ProjectRegistry, {
      modelSettingsStore: store,
      modelCatalog: new ModelCatalog(),
    });
    await writable.ready();
    try {
      const put = await writable.inject({
        method: "PUT",
        url: "/api/settings/models",
        payload: {
          models: {
            text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-new" } }, sampling: { temperature: 0.7 } },
            image: { defaultModel: "", providers: {} },
          },
          customProviders: [],
        },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({
        models: {
          text: {
            defaultModel: "openai/gpt-4o",
            providers: { openai: { configured: true } },
            sampling: { temperature: 0.7 },
          },
          image: { defaultModel: "", providers: {} },
        },
        customProviders: [],
      });
      expect(registry.setDefaultModel).toHaveBeenCalledWith("openai/gpt-4o");
      expect(registry.setSampling).toHaveBeenCalledWith({ temperature: 0.7 });
      expect(registry.setThinkingLevel).toHaveBeenCalledWith(undefined);

      const del = await writable.inject({
        method: "PUT",
        url: "/api/settings/models",
        payload: {
          models: {
            text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "" } } },
            image: { defaultModel: "", providers: {} },
          },
        },
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().models.text.providers).toEqual({});
    } finally {
      if (savedEnv === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedEnv;
      await writable.close();
    }
  });

  it("rejects malformed PUT bodies with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/models",
      payload: { models: { text: { providers: {} } } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("preserves custom provider headers across GET sanitized PUT round-trips", async () => {
    const store = new ModelSettingsStore();
    store.applyUpdate({
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [
        { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false, headers: { Authorization: "Bearer sk-x" } },
      ],
    });
    const loop = Fastify();
    registerSettingsRoutes(loop, {} as ProjectRegistry, {
      modelSettingsStore: store,
      modelCatalog: new ModelCatalog(),
    });
    await loop.ready();
    try {
      const got = await loop.inject({ method: "GET", url: "/api/settings/models" });
      expect(got.json().customProviders).toEqual([
        { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false },
      ]);

      const put = await loop.inject({
        method: "PUT",
        url: "/api/settings/models",
        payload: {
          models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
          customProviders: [
            { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false },
          ],
        },
      });
      expect(put.statusCode).toBe(200);
      expect(store.get().customProviders).toEqual([
        { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false, headers: { Authorization: "Bearer sk-x" } },
      ]);
    } finally {
      await loop.close();
    }
  });

  it("pushes empty defaultModel to the registry as undefined", async () => {
    const store = new ModelSettingsStore();
    const registry = {
      setDefaultModel: vi.fn(),
      setSampling: vi.fn(),
      setThinkingLevel: vi.fn(),
    };
    const cleared = Fastify();
    registerSettingsRoutes(cleared, registry as unknown as ProjectRegistry, {
      modelSettingsStore: store,
      modelCatalog: new ModelCatalog(),
    });
    await cleared.ready();
    try {
      const res = await cleared.inject({
        method: "PUT",
        url: "/api/settings/models",
        payload: {
          models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(registry.setDefaultModel).toHaveBeenCalledWith(undefined);
    } finally {
      await cleared.close();
    }
  });
});
