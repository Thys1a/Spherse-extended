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
    listAgentDataLinks: vi.fn(),
    addAgentDataLink: vi.fn(),
    removeAgentDataLink: vi.fn(),
  };
});

import {
  ValidationError,
  addAgentDataLink,
  listAgentDataLinks,
  removeAgentDataLink,
} from "@spherse/core";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { projectManager: unknown };
  }
}

describe("agent data-link routes", () => {
  let app: Fastify.FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "srv-data-links-"));
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
    vi.mocked(listAgentDataLinks).mockReset();
    vi.mocked(addAgentDataLink).mockReset();
    vi.mocked(removeAgentDataLink).mockReset();
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET lists links", async () => {
    vi.mocked(listAgentDataLinks).mockReturnValue([
      {
        name: "game.data.json",
        target: "lore/game.data.json",
        dangling: false,
        hasState: true,
        statePath: "_state",
        estimatedTokens: 40,
      },
    ]);
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/agents/a1/data-links" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        name: "game.data.json",
        target: "lore/game.data.json",
        dangling: false,
        hasState: true,
        statePath: "_state",
        estimatedTokens: 40,
      },
    ]);
    expect(listAgentDataLinks).toHaveBeenCalledWith(root, "demo");
  });

  it("GET 404s for unknown agent", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/agents/ghost/data-links" });
    expect(res.statusCode).toBe(404);
  });

  it("POST adds a link with state options", async () => {
    vi.mocked(addAgentDataLink).mockReturnValue({
      name: "game.data.json",
      target: "lore/game.data.json",
      dangling: false,
      hasState: true,
      statePath: "stats",
      estimatedTokens: 20,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/data-links",
      payload: { path: "lore/game.data.json", statePath: "stats", label: "RPG" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "game.data.json", statePath: "stats" });
    expect(addAgentDataLink).toHaveBeenCalledWith(root, "demo", "lore/game.data.json", {
      statePath: "stats",
      label: "RPG",
    });
  });

  it("POST rejects empty path with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/data-links",
      payload: { path: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST maps core errors to status codes", async () => {
    const { NotFoundError, ValidationError, AccessDeniedError, ConflictError } =
      await import("@spherse/core");
    vi.mocked(addAgentDataLink).mockImplementationOnce(() => {
      throw new NotFoundError("gone");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/data-links", payload: { path: "x.data.json" } })).statusCode,
    ).toBe(404);
    vi.mocked(addAgentDataLink).mockImplementationOnce(() => {
      throw new ValidationError("bad");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/data-links", payload: { path: "x.data.json" } })).statusCode,
    ).toBe(400);
    vi.mocked(addAgentDataLink).mockImplementationOnce(() => {
      throw new AccessDeniedError("no");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/data-links", payload: { path: "x.data.json" } })).statusCode,
    ).toBe(403);
    vi.mocked(addAgentDataLink).mockImplementationOnce(() => {
      throw new ConflictError("dup");
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/projects/p1/agents/a1/data-links", payload: { path: "x.data.json" } })).statusCode,
    ).toBe(409);
  });

  it("DELETE removes a link", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/projects/p1/agents/a1/data-links/game.data.json" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(removeAgentDataLink).toHaveBeenCalledWith(root, "demo", "game.data.json");
  });

  it("DELETE rejects unsafe names with 400", async () => {
    vi.mocked(removeAgentDataLink).mockImplementationOnce(() => {
      throw new ValidationError("bad name");
    });
    const res = await app.inject({ method: "DELETE", url: "/api/projects/p1/agents/a1/data-links/x.txt" });
    expect(res.statusCode).toBe(400);
  });
});
