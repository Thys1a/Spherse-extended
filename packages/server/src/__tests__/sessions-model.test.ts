import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerSessionRoutes } from "../routes/sessions.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import type { ChatSessionHub } from "../chat/chat-session-hub.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { sessionRuntime: unknown; projectManager: unknown };
  }
}

describe("PATCH .../agents/:agentId/sessions/:id/model route", () => {
  let app: Fastify.FastifyInstance;
  let setSessionModel: ReturnType<typeof vi.fn>;
  let getSession: ReturnType<typeof vi.fn>;

  const session = {
    id: "s1",
    agentId: "a1",
    createdAt: 1,
    updatedAt: 2,
    status: "active",
    model: "openai/gpt-4o",
  };

  beforeEach(async () => {
    setSessionModel = vi.fn().mockReturnValue("openai/gpt-4o");
    getSession = vi.fn().mockReturnValue(session);
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { sessionRuntime: { setSessionModel }, projectManager: { getSession } };
    });
    registerSessionRoutes(app, {} as ProjectRegistry, {} as ChatSessionHub);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("sets the session model and responds with the updated session", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/projects/p1/agents/a1/sessions/s1/model",
      payload: { modelId: "openai/gpt-4o" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(session);
    expect(setSessionModel).toHaveBeenCalledWith("a1", "s1", "openai/gpt-4o");
  });

  it("responds 404 when the session is gone after the update", async () => {
    getSession.mockReturnValue(null);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/projects/p1/agents/a1/sessions/s1/model",
      payload: { modelId: "openai/gpt-4o" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects a missing modelId with 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/projects/p1/agents/a1/sessions/s1/model",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(setSessionModel).not.toHaveBeenCalled();
  });
});
