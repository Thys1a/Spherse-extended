import type { FastifyInstance } from "fastify";
import {
  AccessDeniedError,
  ConflictError,
  NotFoundError,
  ValidationError,
  addAgentCardLink,
  listAgentCardLinks,
  removeAgentCardLink,
} from "@spherse/core";
import { schemas, parseContract } from "@spherse/contracts";
import type { ProjectRegistry } from "../registry.js";
import { conflict, forbidden, notFound } from "../errors.js";

export function registerAgentRoutes(fastify: FastifyInstance, _registry: ProjectRegistry): void {
  fastify.get("/api/projects/:projectId/agents", {
    schema: { response: { 200: schemas.agentListResponse } },
    async handler(req) {
      const agents = await req.projectCtx!.projectManager.listAgents();
      // 列表只下发摘要；完整配置由单条端点 / raw 内容按需加载
      return agents.map(({ id, name, alias, slug, createdAt, model }) => ({
        id,
        name,
        ...(alias !== undefined ? { alias } : {}),
        slug,
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(model !== undefined ? { model } : {}),
      }));
    },
  });

  fastify.get<{ Params: { projectId: string; id: string } }>(
    "/api/projects/:projectId/agents/:id",
    {
      schema: { response: { 200: schemas.agentProfile } },
      async handler(req) {
        const profile = await req.projectCtx!.projectManager.getAgentProfile(req.params.id);
        if (!profile) throw notFound("Agent not found");
        return profile;
      },
    },
  );

  fastify.get<{ Params: { projectId: string; id: string } }>(
    "/api/projects/:projectId/agents/:id/raw",
    {
      schema: { response: { 200: schemas.agentRawResponse } },
      async handler(req) {
        const raw = await req.projectCtx!.projectManager.getRawContent(req.params.id);
        if (raw === null) throw notFound("Agent not found");
        return { content: raw };
      },
    },
  );

  fastify.get<{ Params: { projectId: string; id: string } }>(
    "/api/projects/:projectId/agents/:id/theme",
    async (req, reply) => {
      const theme = await req.projectCtx!.projectManager.getAgentTheme(req.params.id);
      reply.type("text/css").send(theme);
    },
  );

  function agentSlugOr404(projectManager: { getAgentProfile(id: string): { slug: string } | null }, id: string): string {
    const profile = projectManager.getAgentProfile(id);
    if (!profile) throw notFound("Agent not found");
    return profile.slug;
  }

  fastify.get<{ Params: { projectId: string; id: string } }>(
    "/api/projects/:projectId/agents/:id/card-links",
    {
      schema: { response: { 200: schemas.cardLinkListResponse } },
      async handler(req) {
        const ctx = req.projectCtx!;
        const slug = agentSlugOr404(ctx.projectManager, req.params.id);
        return parseContract(
          schemas.cardLinkListResponse,
          listAgentCardLinks(ctx.projectManager.getRootPath(), slug),
        );
      },
    },
  );

  fastify.post<{ Params: { projectId: string; id: string } }>(
    "/api/projects/:projectId/agents/:id/card-links",
    {
      schema: { body: schemas.cardLinkAddRequest, response: { 200: schemas.cardLinkAddResponse } },
      async handler(req, reply) {
        const body = parseContract(schemas.cardLinkAddRequest, req.body);
        const ctx = req.projectCtx!;
        const slug = agentSlugOr404(ctx.projectManager, req.params.id);
        try {
          const link = addAgentCardLink(ctx.projectManager.getRootPath(), slug, body.path);
          return parseContract(schemas.cardLinkAddResponse, link);
        } catch (err) {
          if (err instanceof NotFoundError) throw notFound(err.message);
          if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
          if (err instanceof AccessDeniedError) throw forbidden(err.message);
          if (err instanceof ConflictError) throw conflict(err.message);
          throw err;
        }
      },
    },
  );

  fastify.delete<{ Params: { projectId: string; id: string; name: string } }>(
    "/api/projects/:projectId/agents/:id/card-links/:name",
    {
      schema: { response: { 200: schemas.okResponse } },
      async handler(req, reply) {
        const ctx = req.projectCtx!;
        const slug = agentSlugOr404(ctx.projectManager, req.params.id);
        try {
          removeAgentCardLink(ctx.projectManager.getRootPath(), slug, req.params.name);
          return { ok: true };
        } catch (err) {
          if (err instanceof NotFoundError) throw notFound(err.message);
          if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
          throw err;
        }
      },
    },
  );
}
