import type { FastifyInstance } from "fastify";
import { schemas, parseContract } from "@spherse/contracts";
import type { CommandCreateRequest, CommandUpdateRequest } from "@spherse/contracts";
import type { ProjectRegistry } from "../registry.js";
import { notFound } from "../errors.js";

export function registerCommandRoutes(fastify: FastifyInstance, _registry: ProjectRegistry): void {
  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/commands",
    {
      schema: { response: { 200: schemas.commandListResponse } },
      async handler(req) {
        return req.projectCtx!.projectManager.listCommands();
      },
    },
  );

  fastify.get<{ Params: { projectId: string; name: string } }>(
    "/api/projects/:projectId/commands/:name",
    {
      schema: { response: { 200: schemas.commandDefinition } },
      async handler(req) {
        const command = await req.projectCtx!.projectManager.getCommand(req.params.name);
        if (!command) throw notFound("Command not found");
        return command;
      },
    },
  );

  fastify.post<{ Params: { projectId: string }; Body: CommandCreateRequest }>(
    "/api/projects/:projectId/commands",
    {
      schema: {
        body: schemas.commandCreateRequest,
        response: { 200: schemas.commandDefinition },
      },
      async handler(req) {
        const { name, description, model, template } = req.body;
        const command = await req.projectCtx!.projectManager.createCommand({
          name,
          ...(description !== undefined ? { description } : {}),
          ...(model !== undefined ? { model } : {}),
          template,
        });
        return parseContract(schemas.commandDefinition, command);
      },
    },
  );

  fastify.put<{ Params: { projectId: string; name: string }; Body: CommandUpdateRequest }>(
    "/api/projects/:projectId/commands/:name",
    {
      schema: {
        body: schemas.commandUpdateRequest,
        response: { 200: schemas.commandDefinition },
      },
      async handler(req) {
        const { description, model, template } = req.body;
        const command = await req.projectCtx!.projectManager.updateCommand(req.params.name, {
          ...(description !== undefined ? { description } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(template !== undefined ? { template } : {}),
        });
        return parseContract(schemas.commandDefinition, command);
      },
    },
  );

  fastify.delete<{ Params: { projectId: string; name: string } }>(
    "/api/projects/:projectId/commands/:name",
    {
      schema: { response: { 200: schemas.okResponse } },
      async handler(req) {
        await req.projectCtx!.projectManager.deleteCommand(req.params.name);
        return { ok: true };
      },
    },
  );
}
