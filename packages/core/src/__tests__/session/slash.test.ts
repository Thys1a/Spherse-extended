import { describe, expect, it, vi, beforeEach } from "vitest";
import { expandSlashMessage, parseSlashCommand } from "../../session/slash.js";
import { ValidationError } from "../../errors.js";

describe("parseSlashCommand", () => {
  it("parses skill and command invocations", () => {
    expect(parseSlashCommand("/skill:review fix the bug")).toEqual({
      kind: "skill",
      name: "review",
      rawArgs: "fix the bug",
    });
    expect(parseSlashCommand("/command:test")).toEqual({
      kind: "command",
      name: "test",
      rawArgs: "",
    });
  });

  it("returns null for plain text", () => {
    expect(parseSlashCommand("hello")).toBeNull();
    expect(parseSlashCommand("/unknown:x")).toBeNull();
    expect(parseSlashCommand("/skill:")).toBeNull();
  });
});

function skillStore(skills: Record<string, { name: string; instructions: string; source?: "project"; files?: string[]; filePath?: string }>) {
  return {
    get: vi.fn(async (name: string) => {
      const found = skills[name];
      if (!found) return null;
      return {
        description: "",
        source: "project",
        files: [],
        filePath: "/tmp/.spherse/skills/x/SKILL.md",
        ...found,
      };
    }),
  };
}

function commandStore(commands: Record<string, { template: string; description?: string; model?: string }>) {
  return {
    get: vi.fn(async (name: string) => {
      const found = commands[name];
      if (!found) return null;
      return { name, filePath: "/tmp/.spherse/commands/x.md", ...found };
    }),
  };
}

function deps(options?: {
  skills?: Parameters<typeof skillStore>[0];
  commands?: Parameters<typeof commandStore>[0];
  deniedPaths?: string[];
}) {
  const projectStore = {
    getRootPath: () => "/tmp/proj",
    getAgent: () => ({ skills: skillStore(options?.skills ?? {}) }),
    skill: skillStore(options?.skills ?? {}),
    commands: commandStore(options?.commands ?? {}),
    config: { getAiAccessSettings: () => ({ deniedPaths: options?.deniedPaths ?? [] }) },
  };
  return { projectStore, capabilities: [] } as never;
}

describe("expandSlashMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for non-slash text", async () => {
    expect(await expandSlashMessage(deps(), "a1", "hello")).toBeNull();
  });

  it("expands a skill with args appended", async () => {
    const result = await expandSlashMessage(
      deps({ skills: { review: { name: "review", instructions: "Review code." } } }),
      "a1",
      "/skill:review focus on tests",
    );
    expect(result?.text).toContain('<skill-content name="review">');
    expect(result?.text).toContain("focus on tests");
    expect(result?.slash).toEqual({ type: "skill", name: "review", rawArgs: "focus on tests" });
    expect(result?.modelOverride).toBeUndefined();
  });

  it("throws for an unknown skill", async () => {
    await expect(expandSlashMessage(deps(), "a1", "/skill:nope x")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("expands $ARGUMENTS, $1 and @path in commands", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wb-slash-"));
    try {
      await fs.writeFile(path.join(tmp, "a.txt"), "file-content");
      const d = deps({
        commands: { greet: { template: "Hi $1! $ARGUMENTS See @a.txt" } },
      });
      (d.projectStore as { getRootPath: () => string }).getRootPath = () => tmp;
      const result = await expandSlashMessage(d, "a1", "/command:greet Bob extra words");
      expect(result?.text).toContain("Hi Bob!");
      expect(result?.text).toContain("extra words");
      expect(result?.text).toContain("file-content");
      expect(result?.slash).toEqual({ type: "command", name: "greet", rawArgs: "Bob extra words" });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("throws for missing positional args and unreadable files", async () => {
    const d = deps({ commands: { need: { template: "Make $1" } } });
    await expect(expandSlashMessage(d, "a1", "/command:need")).rejects.toThrow(/\$1/);
    const d2 = deps({ commands: { ref: { template: "See @missing.txt" } } });
    await expect(expandSlashMessage(d2, "a1", "/command:ref")).rejects.toThrow(/missing\.txt/);
  });

  it("passes the command model through as an override", async () => {
    const d = deps({ commands: { m: { template: "Do it", model: "openai/gpt-4o" } } });
    const result = await expandSlashMessage(d, "a1", "/command:m");
    expect(result?.modelOverride).toBe("openai/gpt-4o");
  });

  it("throws for an unknown command", async () => {
    await expect(expandSlashMessage(deps(), "a1", "/command:nope")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
