import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { ModelCatalog } from "@spherse/core";
import type { ModelSettingsRequest, WebSearchSettingsRequest, UserSkillSettings } from "@spherse/contracts";
import type { ProjectRegistry } from "../registry.js";
import { getImageSupportedProviders, resolveProjectPath } from "@spherse/core";
import { schemas } from "@spherse/contracts";
import type { ModelSettingsStore } from "../model-settings.js";
import { applyModelSettingsToEnv } from "../model-settings.js";
import type { WebSearchSettingsStore } from "../web-search-settings.js";
import { applyWebSearchEnv } from "../web-search-settings.js";
import { UserSkillSettingsStore, normalizeSkillDir } from "../user-skill-settings.js";
import { isPathInside } from "@spherse/core";
import { ValidationError } from "@spherse/core";

interface SettingsRouteOptions {
  modelSettingsStore: ModelSettingsStore;
  modelCatalog: ModelCatalog;
  webSearchSettingsStore: WebSearchSettingsStore;
  userSkillSettingsStore?: UserSkillSettingsStore;
}

const fallbackUserSkillSettingsStore = new UserSkillSettingsStore();

export function registerSettingsRoutes(
  fastify: FastifyInstance,
  registry: ProjectRegistry,
  options: SettingsRouteOptions,
): void {
  const userSkillSettings = options.userSkillSettingsStore ?? fallbackUserSkillSettingsStore;
  fastify.get("/api/settings/models", {
    schema: { response: { 200: schemas.modelSettingsResponse } },
    async handler() {
      return options.modelSettingsStore.sanitize();
    },
  });

  fastify.put<{ Body: ModelSettingsRequest }>("/api/settings/models", {
    schema: {
      body: schemas.modelSettingsRequest,
      response: { 200: schemas.modelSettingsResponse },
    },
    async handler(req) {
      const next = options.modelSettingsStore.applyUpdate(req.body);
      applyModelSettingsToEnv(next, options.modelCatalog);
      registry.setDefaultModel(next.text.defaultModel || undefined);
      registry.setSampling(next.text.sampling);
      registry.setThinkingLevel(next.text.thinkingLevel);
      return options.modelSettingsStore.sanitize();
    },
  });

  fastify.get("/api/settings/web-search", {
    schema: { response: { 200: schemas.webSearchSettingsResponse } },
    async handler() {
      return options.webSearchSettingsStore.sanitize();
    },
  });

  fastify.put<{ Body: WebSearchSettingsRequest }>("/api/settings/web-search", {
    schema: {
      body: schemas.webSearchSettingsRequest,
      response: { 200: schemas.webSearchSettingsResponse },
    },
    async handler(req) {
      const next = options.webSearchSettingsStore.applyUpdate(req.body);
      applyWebSearchEnv(next);
      return options.webSearchSettingsStore.sanitize();
    },
  });

  fastify.get("/api/settings/providers", {
    schema: { response: { 200: schemas.providerCatalog } },
    async handler() {
      return options.modelCatalog.getSupportedProviders();
    },
  });

  fastify.get("/api/settings/image-providers", {
    schema: { response: { 200: schemas.providerCatalog } },
    async handler() {
      return getImageSupportedProviders();
    },
  });

  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/settings/ai-access",
    {
      schema: { response: { 200: schemas.aiAccessSettingsResponse } },
      async handler(req) {
        return { ok: true, ...req.projectCtx!.projectManager.getAiAccessSettings() };
      },
    },
  );

  fastify.put<{ Params: { projectId: string }; Body: { deniedPaths: string[] } }>(
    "/api/projects/:projectId/settings/ai-access",
    {
      schema: {
        body: schemas.aiAccessSettingsRequest,
        response: {
          200: schemas.aiAccessSettingsResponse,
        },
      },
    },
    async (req) => {
      const settings = await req.projectCtx!.projectManager.updateAiAccessSettings(req.body.deniedPaths);
      return { ok: true, ...settings };
    },
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/settings/welcome-page",
    {
      schema: { response: { 200: schemas.welcomePageSettingsResponse } },
      async handler(req) {
        return { ok: true, ...req.projectCtx!.projectManager.getWelcomePageSettings() };
      },
    },
  );

  fastify.put<{ Params: { projectId: string }; Body: { path: string | null } }>(
    "/api/projects/:projectId/settings/welcome-page",
    {
      schema: {
        body: schemas.welcomePageSettingsRequest,
        response: {
          200: schemas.welcomePageSettingsResponse,
        },
      },
    },
    async (req) => {
      const settings = await req.projectCtx!.projectManager.updateWelcomePageSettings(req.body.path);
      return { ok: true, ...settings };
    },
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/settings/side-panel",
    {
      schema: { response: { 200: schemas.sidePanelSettingsResponse } },
      async handler(req) {
        return { ok: true, ...req.projectCtx!.projectManager.getSidePanelSettings() };
      },
    },
  );

  fastify.put<{ Params: { projectId: string }; Body: { path: string | null } }>(
    "/api/projects/:projectId/settings/side-panel",
    {
      schema: {
        body: schemas.sidePanelSettingsRequest,
        response: {
          200: schemas.sidePanelSettingsResponse,
        },
      },
    },
    async (req) => {
      const settings = await req.projectCtx!.projectManager.updateSidePanelSettings(req.body.path);
      return { ok: true, ...settings };
    },
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/settings/theme",
    {
      schema: { response: { 200: schemas.themeSettingsResponse } },
      async handler(req) {
        const root = req.projectCtx!.projectManager.getRootPath();
        const absolutePath = resolveProjectPath(root, ".spherse/theme.css");
        let content = "";
        try {
          content = await fs.readFile(absolutePath, "utf-8");
        } catch {
          content = "";
        }
        return { ok: true, content };
      },
    },
  );

  fastify.put<{ Params: { projectId: string }; Body: { content: string } }>(
    "/api/projects/:projectId/settings/theme",
    {
      schema: {
        body: schemas.themeSettingsRequest,
        response: { 200: schemas.okResponse },
      },
    },
    async (req) => {
      await req.projectCtx!.projectManager.writeFile(".spherse/theme.css", req.body.content);
      return { ok: true };
    },
  );

  fastify.get("/api/settings/skills", {
    schema: { response: { 200: schemas.userSkillSettingsResponse } },
    async handler() {
      return userSkillSettings.scan();
    },
  });

  fastify.put<{ Body: UserSkillSettings }>("/api/settings/skills", {
    schema: {
      body: schemas.userSkillSettings,
      response: { 200: schemas.userSkillSettingsResponse },
    },
    async handler(req) {
      const store = userSkillSettings;
      if (req.body.customDirs !== undefined) {
        const projectRoots =
          typeof registry.listInfo === "function" ? registry.listInfo().map((info) => info.rootPath) : [];
        for (const raw of req.body.customDirs) {
          const normalized = normalizeSkillDir(raw);
          if (normalized === null) {
            throw new ValidationError(`Custom skill directory must be an absolute path: ${raw}`);
          }
          for (const root of projectRoots) {
            if (isPathInside(root, normalized)) {
              throw new ValidationError(`Custom skill directory must not be inside the project: ${raw}`);
            }
          }
        }
      }
      store.applyUpdate(req.body);
      registry.markAllSessionsReloadPending();
      return store.scan();
    },
  });
}
