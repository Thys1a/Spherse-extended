import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ModelCatalog } from "@spherse/core";
import { registerSettingsRoutes } from "../routes/settings.js";
import type { ProjectRegistry } from "../registry.js";
import { ModelSettingsStore } from "../model-settings.js";
import { WebSearchSettingsStore } from "../web-search-settings.js";

describe("GET/PUT /api/settings/web-search routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerSettingsRoutes(app, {} as ProjectRegistry, {
      modelSettingsStore: new ModelSettingsStore(),
      modelCatalog: new ModelCatalog(),
      webSearchSettingsStore: new WebSearchSettingsStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns unconfigured defaults", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings/web-search" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ apiKey: { configured: false }, baseUrl: null, model: null });
  });

  it("rotates the key and clears fields on null through PUT", async () => {
    const savedKey = process.env.SPHERSE_WEB_SEARCH_API_KEY;
    const savedBase = process.env.SPHERSE_WEB_SEARCH_BASE_URL;
    const savedModel = process.env.SPHERSE_WEB_SEARCH_MODEL;
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings/web-search",
      payload: { apiKey: "sk-new", baseUrl: "https://x.example", model: "m" },
    });
    try {
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({
        apiKey: { configured: true },
        baseUrl: "https://x.example",
        model: "m",
      });
      expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBe("sk-new");

      const del = await app.inject({
        method: "PUT",
        url: "/api/settings/web-search",
        payload: { apiKey: null },
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().apiKey).toEqual({ configured: false });
    } finally {
      if (savedKey === undefined) delete process.env.SPHERSE_WEB_SEARCH_API_KEY;
      else process.env.SPHERSE_WEB_SEARCH_API_KEY = savedKey;
      if (savedBase === undefined) delete process.env.SPHERSE_WEB_SEARCH_BASE_URL;
      else process.env.SPHERSE_WEB_SEARCH_BASE_URL = savedBase;
      if (savedModel === undefined) delete process.env.SPHERSE_WEB_SEARCH_MODEL;
      else process.env.SPHERSE_WEB_SEARCH_MODEL = savedModel;
    }
  });

  it("coerces scalar apiKey values to strings through fastify validation", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/web-search",
      payload: { apiKey: 42 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiKey).toEqual({ configured: true });
  });
});
