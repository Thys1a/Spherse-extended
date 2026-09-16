import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AccessDeniedError,
  CardFileCorruptedError,
  CardNotFoundError,
  CardTooLargeError,
  CardWriteFailedError,
  EntryNotFoundError,
  InvalidFieldError,
  serverAccessPolicy,
  type CardStore,
} from "@spherse/core";
import { schemas, parseContract } from "@spherse/contracts";
import type { ProjectRegistry } from "../registry.js";

function cardStoreOf(registry: ProjectRegistry, req: { params: { projectId: string } }): CardStore {
  const ctx = registry.get(req.params.projectId);
  const store = ctx?.runtime.cardStore;
  if (!store) throw new Error("card store not available for this project");
  return store;
}

function sendCardError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CardNotFoundError) {
    return reply.code(404).send({ error: err.message, code: "card_not_found" });
  }
  if (err instanceof EntryNotFoundError) {
    return reply.code(404).send({ error: err.message, code: "entry_not_found" });
  }
  if (err instanceof CardFileCorruptedError) {
    return reply.code(422).send({ error: err.message, code: "invalid_json" });
  }
  if (err instanceof InvalidFieldError) {
    return reply.code(400).send({ error: err.message, code: "invalid_field", fields: err.fields });
  }
  if (err instanceof CardTooLargeError) {
    return reply.code(413).send({ error: err.message, code: "too_large" });
  }
  if (err instanceof CardWriteFailedError) {
    return reply.code(500).send({ error: err.message, code: "write_failed" });
  }
  if (err instanceof AccessDeniedError) {
    return reply.code(403).send({ error: "Access denied", code: "forbidden" });
  }
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(400).send({ error: message, code: "bad_request" });
}

export function registerCardRoutes(fastify: FastifyInstance, registry: ProjectRegistry): void {
  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/list",
    { schema: { body: schemas.cardListRequest, response: { 200: schemas.cardListResponse } } },
    async (req, reply) => {
      const body = parseContract(schemas.cardListRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      const policy = serverAccessPolicy(root);
      try {
        const items = await store.list(body.dir);
        return reply.code(200).send(items.filter((i) => policy.canRead(i.path)));
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/meta",
    { schema: { body: schemas.cardMetaRequest, response: { 200: schemas.cardMetaResponse } } },
    async (req, reply) => {
      const body = parseContract(schemas.cardMetaRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertRead(body.path);
        return reply.code(200).send(await store.meta(body.path));
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/entries",
    { schema: { body: schemas.cardEntriesRequest, response: { 200: schemas.cardEntriesResponse } } },
    async (req, reply) => {
      const body = parseContract(schemas.cardEntriesRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertRead(body.path);
        return reply.code(200).send(
          await store.entries(body.path, {
            ...(body.filter?.enabled !== undefined ? { enabled: body.filter.enabled } : {}),
            ...(body.filter?.constant !== undefined ? { constant: body.filter.constant } : {}),
          }),
        );
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/search",
    { schema: { body: schemas.cardSearchRequest, response: { 200: schemas.cardSearchResponse } } },
    async (req, reply) => {
      const body = parseContract(schemas.cardSearchRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertRead(body.path);
        const results = await store.search(body.path, {
          ...(body.query !== undefined ? { query: body.query } : {}),
          ...(body.fields !== undefined
            ? { fields: body.fields as Array<"keys" | "secondary_keys" | "comment" | "content"> }
            : {}),
          ...(body.onlyEnabled !== undefined ? { onlyEnabled: body.onlyEnabled } : {}),
          ...(body.limit !== undefined ? { limit: body.limit } : {}),
          ...(body.snippetChars !== undefined ? { snippetChars: body.snippetChars } : {}),
        });
        return reply.code(200).send({
          path: body.path,
          ...(body.query !== undefined ? { query: body.query } : {}),
          fields: body.fields ?? ["keys", "comment"],
          onlyEnabled: body.onlyEnabled ?? true,
          total: results.length,
          results,
        });
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/entry",
    { schema: { body: schemas.cardEntryRequest, response: { 200: schemas.cardEntryResponse } } },
    async (req, reply) => {
      const body = parseContract(schemas.cardEntryRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertRead(body.path);
        return reply.code(200).send(await store.entry(body.path, body.id));
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/entry/many",
    {
      schema: { body: schemas.cardEntryManyRequest, response: { 200: schemas.cardEntryManyResponse } },
    },
    async (req, reply) => {
      const body = parseContract(schemas.cardEntryManyRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertRead(body.path);
        return reply.code(200).send(await store.entryMany(body.path, body.ids));
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/entry/update",
    {
      schema: {
        body: schemas.cardEntryUpdateRequest,
        response: { 200: schemas.cardEntryUpdateResponse },
      },
    },
    async (req, reply) => {
      const body = parseContract(schemas.cardEntryUpdateRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertWrite(body.path);
        return reply.code(200).send(
          await store.updateEntry(body.path, body.id, body.patch, {
            ...(body.idempotencyKey !== undefined ? { idempotencyKey: body.idempotencyKey } : {}),
          }),
        );
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/card/entry/bulk",
    {
      schema: {
        body: schemas.cardEntryBulkRequest,
        response: { 200: schemas.cardEntryBulkResponse },
      },
    },
    async (req, reply) => {
      const body = parseContract(schemas.cardEntryBulkRequest, req.body);
      const store = cardStoreOf(registry, req);
      const root = req.projectCtx!.projectManager.getRootPath();
      try {
        serverAccessPolicy(root).assertWrite(body.path);
        return reply.code(200).send(
          await store.bulkUpdate(body.path, body.ids, body.patch, {
            ...(body.idempotencyKey !== undefined ? { idempotencyKey: body.idempotencyKey } : {}),
          }),
        );
      } catch (err) {
        return sendCardError(reply, err);
      }
    },
  );
}
