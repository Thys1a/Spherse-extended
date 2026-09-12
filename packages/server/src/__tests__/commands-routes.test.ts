import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerCommandRoutes } from "../routes/commands.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { projectManager: unknown };
  }
}

const FULL_COMMAND = {
  name: "test",
  description: "Run tests",
  model: "openai/gpt-4o",
  template: "Run $ARGUMENTS with coverage",
  filePath: "/tmp/p/.spherse/commands/test.md",
};

describe("command routes", () => {
  let app: Fastify.FastifyInstance;
  let projectManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    projectManager = {
      listCommands: vi.fn().mockResolvedValue([FULL_COMMAND]),
      getCommand: vi.fn().mockResolvedValue(FULL_COMMAND),
      createCommand: vi.fn().mockResolvedValue(FULL_COMMAND),
      updateCommand: vi.fn().mockResolvedValue(FULL_COMMAND),
      deleteCommand: vi.fn().mockResolvedValue(undefined),
    };
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { projectManager };
    });
    registerCommandRoutes(app, {} as ProjectRegistry);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists commands", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/commands" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([FULL_COMMAND]);
  });

  it("returns a single command", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/commands/test" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FULL_COMMAND);
  });

  it("creates a command and passes the payload through", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/commands",
      payload: { name: "test", template: "Run $ARGUMENTS" },
    });
    expect(res.statusCode).toBe(200);
    expect(projectManager.createCommand).toHaveBeenCalledWith({
      name: "test",
      template: "Run $ARGUMENTS",
    });
  });

  it("rejects creation without a template", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/commands",
      payload: { name: "test" },
    });
    expect(res.statusCode).toBe(400);
    expect(projectManager.createCommand).not.toHaveBeenCalled();
  });

  it("updates a command", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/projects/p1/commands/test",
      payload: { template: "Run $1 now" },
    });
    expect(res.statusCode).toBe(200);
    expect(projectManager.updateCommand).toHaveBeenCalledWith("test", { template: "Run $1 now" });
  });

  it("deletes a command", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/p1/commands/test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(projectManager.deleteCommand).toHaveBeenCalledWith("test");
  });
});
