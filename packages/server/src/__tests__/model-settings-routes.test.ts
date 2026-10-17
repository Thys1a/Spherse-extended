import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
