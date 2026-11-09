import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerAgentRoutes } from "../routes/agents.js";
import type { FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import { schemas, parseContract } from "@spherse/contracts";
import { addAgentDataLink, listAgentDataLinks, removeAgentDataLink } from "@spherse/core";

declare module "fastify" {
  interface FastifyRequest {
    projectCtx?: { projectManager: unknown };
  }
}

function canCreateSymlinks(): boolean {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "srv-data-link-probe-"));
  try {
    fs.symlinkSync(path.join(probe, "t"), path.join(probe, "l"), "file");
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

describe("agent data-link contract (no core mocks)", () => {
  let app: Fastify.FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "srv-data-link-real-"));
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
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
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET 404s for unknown agent", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/agents/ghost/data-links" });
    expect(res.statusCode).toBe(404);
  });

  it("POST rejects non-data targets without touching the filesystem", async () => {
    fs.writeFileSync(path.join(root, "lore", "notes.txt"), "plain");
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/agents/a1/data-links",
      payload: { path: "lore/notes.txt" },
    });
    expect(res.statusCode).toBe(400);
  });

  describe.runIf(canCreateSymlinks())("with symlink privileges", () => {
    it("core output satisfies the contract schemas end to end", () => {
      fs.writeFileSync(path.join(root, "lore", "game.data.json"), JSON.stringify({ gold: 10 }));
      const added = addAgentDataLink(root, "demo", "lore/game.data.json", {
        statePath: "stats",
        label: "RPG",
      });
      expect(() => parseContract(schemas.dataLinkAddResponse, added)).not.toThrow();
      const listed = listAgentDataLinks(root, "demo");
      expect(() => parseContract(schemas.dataLinkListResponse, listed)).not.toThrow();
      expect(listed).toHaveLength(1);
      removeAgentDataLink(root, "demo", "game.data.json");
      expect(listAgentDataLinks(root, "demo")).toHaveLength(0);
    });

    it("POST/GET/DELETE round-trip through HTTP satisfies contracts", async () => {
      fs.writeFileSync(path.join(root, "lore", "game.data.json"), JSON.stringify({ gold: 10 }));
      const post = await app.inject({
        method: "POST",
        url: "/api/projects/p1/agents/a1/data-links",
        payload: { path: "lore/game.data.json", statePath: "stats", label: "RPG" },
      });
      expect(post.statusCode).toBe(200);
      const added = parseContract(schemas.dataLinkAddResponse, post.json());
      expect(added).toMatchObject({ name: "game.data.json", statePath: "stats", hasState: true });
      const get = await app.inject({ method: "GET", url: "/api/projects/p1/agents/a1/data-links" });
      expect(get.statusCode).toBe(200);
      const listed = parseContract(schemas.dataLinkListResponse, get.json());
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ name: added.name, target: added.target });
      const del = await app.inject({
        method: "DELETE",
        url: "/api/projects/p1/agents/a1/data-links/game.data.json",
      });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ ok: true });
      const empty = await app.inject({ method: "GET", url: "/api/projects/p1/agents/a1/data-links" });
      expect(empty.json()).toEqual([]);
    });
  });
});
