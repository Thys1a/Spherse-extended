import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { createProject, type Logger, type ProjectRuntime } from "@spherse/core";
import { NotFoundError, ValidationError } from "@spherse/core";
import { registerSessionRoutes } from "../routes/sessions.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import type { ChatSessionHub } from "../chat/chat-session-hub.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { sessionRuntime: unknown; projectManager: unknown };
  }
}

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => silentLogger,
};

const TEST_AGENT_PROFILE = `---
name: Test Agent
tools:
  - read_file
---

Test agent for contracts.`;

const stubCatalog = {
  getChatStreamFn: () => () => {},
  resolveModelById: (modelId: string) => {
    if (modelId === "openai/gpt-4o") return { id: "gpt-4o", provider: "openai" };
    throw new Error(`Could not resolve model: ${modelId}`);
  },
} as never;

describe("PATCH .../sessions/:id/model server-core contract", () => {
  let tmpDir: string;
  let runtime: ProjectRuntime;
  let agentId: string;
  let sessionId: string;
  let app: Fastify.FastifyInstance;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-model-contract-"));
    runtime = await createProject(tmpDir, {
      projectName: "Contract",
      logger: silentLogger,
      modelCatalog: stubCatalog,
    });
    const projectStore = runtime.projectManager.projectStore;
    agentId = (await projectStore.createAgent("test-agent", TEST_AGENT_PROFILE)).getProfile().id;
    sessionId = await runtime.sessionRuntime.createSession(agentId);

    app = Fastify();
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
      return reply.code(500).send({ error: (err as Error).message });
    });
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = {
        sessionRuntime: runtime.sessionRuntime,
        projectManager: runtime.projectManager,
      };
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

  function patchModel(modelId: string) {
    return app.inject({
      method: "PATCH",
      url: `/api/projects/p1/agents/${agentId}/sessions/${sessionId}/model`,
      payload: { modelId },
    });
  }

  function storedModel(): string | undefined {
    return runtime.projectManager.getSession(agentId, sessionId)?.model;
  }

  it("rejects an unknown model with 400 without writing", async () => {
    const res = await patchModel("nope/nope");
    expect(res.statusCode).toBe(400);
    expect(storedModel()).toBeUndefined();
  });

  it("persists a known model and returns it", async () => {
    const res = await patchModel("openai/gpt-4o");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: sessionId, model: "openai/gpt-4o" });
    expect(storedModel()).toBe("openai/gpt-4o");
  });

  it("clears the model on an empty modelId", async () => {
    await patchModel("openai/gpt-4o");
    const res = await patchModel("");
    expect(res.statusCode).toBe(200);
    expect(res.json().model).toBeUndefined();
    expect(storedModel()).toBeUndefined();
  });
});
