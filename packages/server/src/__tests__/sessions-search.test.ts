import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { createProject, type ProjectRuntime, type SessionEvent } from "@spherse/core";
import { registerSessionRoutes } from "../routes/sessions.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import type { ChatSessionHub } from "../chat/chat-session-hub.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { projectManager: unknown };
  }
}

function hit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    agentId: "a1",
    sessionId: "s1",
    sessionTitle: "session",
    seq: 3,
    role: "user",
    snippet: "…needle…",
    time: 100,
    ...overrides,
  };
}

describe("GET /api/projects/:projectId/sessions/search route", () => {
  let app: Fastify.FastifyInstance;
  let searchProjectMessages: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    searchProjectMessages = vi.fn().mockReturnValue([hit()]);
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { projectManager: { searchProjectMessages } };
    });
    registerSessionRoutes(app, {} as ProjectRegistry, {} as ChatSessionHub);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("passes q and default limit to the manager", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/sessions/search?q=needle",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [hit()] });
    expect(searchProjectMessages).toHaveBeenCalledWith("needle", 50);
  });

  it("returns empty results without calling the manager for blank q", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/sessions/search?q=%20%20",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [] });
    expect(searchProjectMessages).not.toHaveBeenCalled();
  });

  it("clamps limit to [1, 100]", async () => {
    await app.inject({ method: "GET", url: "/api/projects/p1/sessions/search?q=a&limit=500" });
    expect(searchProjectMessages).toHaveBeenLastCalledWith("a", 100);

    await app.inject({ method: "GET", url: "/api/projects/p1/sessions/search?q=a&limit=0" });
    expect(searchProjectMessages).toHaveBeenLastCalledWith("a", 1);

    await app.inject({ method: "GET", url: "/api/projects/p1/sessions/search?q=a&limit=garbage" });
    expect(searchProjectMessages).toHaveBeenLastCalledWith("a", 50);
  });

});

const TEST_AGENT_PROFILE = `---
name: Search Agent
tools:
  - read_file
---

Test agent for search contracts.`;

describe("GET /api/projects/:projectId/sessions/search core contract", () => {
  let tmpDir: string;
  let runtime: ProjectRuntime;
  let agentId: string;
  let sessionId: string;
  let app: Fastify.FastifyInstance;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-search-contract-"));
    runtime = await createProject(tmpDir, { projectName: "SearchContract" });
    const projectStore = runtime.projectManager.projectStore;
    agentId = (await projectStore.createAgent("search-agent", TEST_AGENT_PROFILE)).getProfile().id;
    const sessions = projectStore.getAgent(agentId)!.sessions;
    sessionId = sessions.createSession();
    sessions.appendEvents(
      sessionId,
      [
        {
          type: "user/message",
          seq: 0,
          time: 100,
          data: { message: { role: "user", content: "needle in the haystack", timestamp: 100 } },
        } as SessionEvent,
      ],
      1,
    );

    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { projectManager: runtime.projectManager };
    });
    registerSessionRoutes(app, {} as ProjectRegistry, {} as ChatSessionHub);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    runtime.timerService.stop();
    await runtime.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves real store hits through the wire contract without sessionTitle", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/sessions/search?q=needle",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      results: [
        {
          agentId,
          sessionId,
          seq: 0,
          role: "user",
          snippet: "needle in the haystack",
          time: 100,
        },
      ],
    });
  });
});
