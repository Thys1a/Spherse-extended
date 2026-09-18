import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerTriggerRoutes } from "../routes/trigger.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { triggerManager: unknown };
  }
}

describe("trigger routes accept sp: event subscriptions (R2.3)", () => {
  let app: Fastify.FastifyInstance;
  let create: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = vi.fn();
    get = vi.fn();
    update = vi.fn();
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = { triggerManager: { create, get, update } };
    });
    registerTriggerRoutes(app, {} as ProjectRegistry);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST create accepts an sp: event subscription", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/triggers",
      payload: {
        type: "event",
        eventName: "sp:assistant-message",
        mode: "new_session",
        message: "saw it",
        notify: false,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    expect(res.json()).toMatchObject({ eventName: "sp:assistant-message", type: "event" });
  });

  it("PUT update accepts an sp: event name", async () => {
    const existing = {
      id: "t1",
      enabled: true,
      type: "event",
      eventName: "user-login",
      mode: "new_session",
      message: "hi",
      notify: false,
      createdAt: 1,
      updatedAt: 1,
    };
    get.mockReturnValue(existing);
    update.mockImplementation((_agentId: string, _triggerId: string, patch: object) => ({
      ...existing,
      ...patch,
    }));

    const res = await app.inject({
      method: "PUT",
      url: "/api/projects/p1/agents/a1/triggers/t1",
      payload: { eventName: "sp:turn-end" },
    });

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith("a1", "t1", { eventName: "sp:turn-end" });
  });
});
