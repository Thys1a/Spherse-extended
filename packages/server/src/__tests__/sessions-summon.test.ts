import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerSessionRoutes } from "../routes/sessions.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import type { ChatSessionHub } from "../chat/chat-session-hub.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: {
      projectManager: unknown;
      sessionRuntime: unknown;
    };
  }
}

describe("POST .../agents/:agentId/sessions/:id/summon route", () => {
  let app: Fastify.FastifyInstance;
  let projectManager: Record<string, ReturnType<typeof vi.fn>>;
  let sessionRuntime: Record<string, ReturnType<typeof vi.fn>>;
  let hub: { startDetachedRun: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    projectManager = {
      listAgents: vi.fn().mockResolvedValue([
        { id: "a1", name: "Main", slug: "main" },
        { id: "a2", name: "Builder", slug: "build" },
      ]),
      getSession: vi.fn(),
    };
    sessionRuntime = {
      createSession: vi.fn().mockResolvedValue("target-s1"),
      appendUserMessage: vi.fn().mockReturnValue(3),
    };
    hub = { startDetachedRun: vi.fn().mockResolvedValue(undefined) };
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { projectManager, sessionRuntime };
    });
    registerSessionRoutes(app, {} as ProjectRegistry, hub as unknown as ChatSessionHub);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a target session, records a summon note and starts a detached run", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/sessions/s1/summon",
      payload: { targetSlug: "build", message: "run the tests" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, targetSessionId: "target-s1" });
    expect(sessionRuntime.createSession).toHaveBeenCalledWith("a2");
    expect(sessionRuntime.appendUserMessage).toHaveBeenCalledWith("a1", "s1", "run the tests", {
      source: "summon",
      summon: { agentId: "a2", sessionId: "target-s1", agentName: "Builder" },
    });
    expect(hub.startDetachedRun).toHaveBeenCalledWith("p1", sessionRuntime, "a2", "target-s1", "run the tests");
  });

  it("responds 404 for an unknown target slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/sessions/s1/summon",
      payload: { targetSlug: "ghost", message: "hi" },
    });

    expect(res.statusCode).toBe(404);
    expect(sessionRuntime.createSession).not.toHaveBeenCalled();
  });

  it("rejects an empty message with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/sessions/s1/summon",
      payload: { targetSlug: "build", message: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(sessionRuntime.createSession).not.toHaveBeenCalled();
  });
});
