import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerAgentRoutes } from "../routes/agents.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";

vi.mock("@spherse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@spherse/core")>();
  return {
    ...actual,
    listAgentCardLinks: vi.fn(),
    addAgentCardLink: vi.fn(),
    removeAgentCardLink: vi.fn(),
  };
});

import {
  addAgentCardLink,
  listAgentCardLinks,
  removeAgentCardLink,
} from "@spherse/core";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { projectManager: unknown };
  }
}

describe("agent card-link routes", () => {
  let app: Fastify.FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "srv-card-links-"));
    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.projectCtx = {
        projectManager: {
          getAgentProfile: vi.fn().mockImplementation((id: string) => (id === "ghost" ? null : { slug: "demo" })),
          getRootPath: vi.fn().mockReturnValue(root),
        },
      };
    });
    registerAgentRoutes(app, {} as ProjectRegistry);
    await app.ready();
    vi.mocked(listAgentCardLinks).mockReset();
    vi.mocked(addAgentCardLink).mockReset();
    vi.mocked(removeAgentCardLink).mockReset();
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET lists links", async () => {
    vi.mocked(listAgentCardLinks).mockReturnValue([
      { name: "lore.card.json", target: "lore/lore.card.json", dangling: false },
    ]);
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/agents/a1/card-links" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { name: "lore.card.json", target: "lore/lore.card.json", dangling: false },
    ]);
    expect(listAgentCardLinks).toHaveBeenCalledWith(root, "demo");
  });

  it("GET 404s for unknown agent", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/agents/ghost/card-links" });
    expect(res.statusCode).toBe(404);
  });

  it("POST adds a link", async () => {
    vi.mocked(addAgentCardLink).mockReturnValue({
      name: "lore.card.json",
      target: "lore/lore.card.json",
      dangling: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/card-links",
      payload: { path: "lore/lore.card.json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "lore.card.json" });
    expect(addAgentCardLink).toHaveBeenCalledWith(root, "demo", "lore/lore.card.json");
  });

  it("POST rejects empty path with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/card-links",
      payload: { path: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST maps core errors to status codes", async () => {
    const { NotFoundError, ValidationError, AccessDeniedError, ConflictError } =
      await import("@spherse/core");
    vi.mocked(addAgentCardLink).mockImplementationOnce(() => {
      throw new NotFoundError("gone");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/card-links", payload: { path: "x.card.json" } })).statusCode,
    ).toBe(404);
    vi.mocked(addAgentCardLink).mockImplementationOnce(() => {
      throw new ValidationError("bad");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/card-links", payload: { path: "x.card.json" } })).statusCode,
    ).toBe(400);
    vi.mocked(addAgentCardLink).mockImplementationOnce(() => {
      throw new AccessDeniedError("no");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/card-links", payload: { path: "x.card.json" } })).statusCode,
    ).toBe(403);
    vi.mocked(addAgentCardLink).mockImplementationOnce(() => {
      throw new ConflictError("dup");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/card-links", payload: { path: "x.card.json" } })).statusCode,
    ).toBe(409);
  });

  it("DELETE removes a link", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/projects/p1/agents/a1/card-links/lore.card.json" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(removeAgentCardLink).toHaveBeenCalledWith(root, "demo", "lore.card.json");
  });
});
