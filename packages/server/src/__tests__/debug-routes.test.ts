import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { NotFoundError } from "@spherse/core";
import { registerDebugRoutes } from "../routes/debug.js";
import { HttpError } from "../errors.js";
import type { ProjectRegistry } from "../registry.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { sessionRuntime: unknown };
  }
}

function createRuntime() {
  const sessionRuntime = {
    getTurnContext: vi.fn(() => ({
      sessionId: "s1",
      capturedAt: "2024-01-01T00:00:00.000Z",
      systemPrompt: "p",
      messages: [],
      tools: [],
      model: "openai/gpt-4o",
      thinkingLevel: "medium",
      sampling: { temperature: 0.7 },
      currentTokens: 128,
    })),
    readSessionEventsAfter: vi.fn(() => [
      { seq: 0, type: "user/message", time: 1, data: { message: { role: "user" } } },
      { seq: 1, type: "turn/start", time: 1, data: {} },
    ]),
  };
  return { sessionRuntime };
}

describe("debug routes", () => {
  let app: FastifyInstance;
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(async () => {
    runtime = createRuntime();
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { sessionRuntime: runtime.sessionRuntime };
    });
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      // Mirrors the production mapping in server/src/index.ts.
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      reply.code(500).send({ error: err.message });
    });
    registerDebugRoutes(app, {} as ProjectRegistry);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the full event log for the session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/debug/sessions/s1/events?agentId=a1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sessionId: "s1",
      events: [
        { seq: 0, type: "user/message", time: 1, data: { message: { role: "user" } } },
        { seq: 1, type: "turn/start", time: 1, data: {} },
      ],
    });
    expect(runtime.sessionRuntime.readSessionEventsAfter).toHaveBeenCalledWith(
      "a1",
      "s1",
      -1,
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("responds 400 when agentId is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/debug/sessions/s1/events",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "agentId is required" });
  });

  it("returns the turn context snapshot with model and sampling fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/debug/sessions/s1/turn-context",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionId: "s1",
      systemPrompt: "p",
      model: "openai/gpt-4o",
      thinkingLevel: "medium",
      sampling: { temperature: 0.7 },
      currentTokens: 128,
    });
    expect(runtime.sessionRuntime.getTurnContext).toHaveBeenCalledWith("s1");
  });

  it("responds 404 when the session runtime is not active", async () => {
    // NOTE: the real getTurnContext throws synchronously (plain sync function),
    // so the mock must throw too — mockRejectedValueOnce would hand a rejected
    // promise to parseContract instead, producing a misleading 500.
    vi.mocked(runtime.sessionRuntime.getTurnContext).mockImplementationOnce(() => {
      throw new NotFoundError('No active session "ghost"');
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/debug/sessions/ghost/turn-context",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'No active session "ghost"' });
  });
});
