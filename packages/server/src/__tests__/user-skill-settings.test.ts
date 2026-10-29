import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { UserSkillSettingsStore, resolveDefaultUserSkillSources } from "../user-skill-settings.js";

describe("resolveDefaultUserSkillSources", () => {
  it("returns the four default locations under the given home", () => {
    const sources = resolveDefaultUserSkillSources("/home/testuser");
    expect(sources.map((s) => s.key)).toEqual(["agents", "claude", "opencode", "codex"]);
    expect(sources.every((s) => s.custom === false)).toBe(true);
    expect(sources[0].dir).toBe(path.join("/home/testuser", ".agents", "skills"));
  });

  it("honors XDG_CONFIG_HOME for the opencode location", () => {
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-test";
    try {
      const sources = resolveDefaultUserSkillSources("/home/testuser");
      expect(sources.find((s) => s.key === "opencode")?.dir).toBe(
        path.join("/tmp/xdg-test", "opencode", "skills"),
      );
    } finally {
      if (original === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = original;
    }
  });
});

describe("UserSkillSettingsStore", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-user-skills-"));
    filePath = path.join(tmpDir, "user-skill-settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty defaults without a file", () => {
    expect(new UserSkillSettingsStore().get()).toEqual({ customDirs: [], enabled: [] });
  });

  it("normalizes and persists updates", () => {
    const store = new UserSkillSettingsStore({ filePath });
    const next = store.applyUpdate({
      customDirs: ["  /tmp/x/skills  ", "", "/tmp/x/skills"],
      enabled: [path.join("/tmp/x/skills", "a"), ""],
    });
    expect(next).toEqual({ customDirs: [path.normalize("/tmp/x/skills")], enabled: [path.join("/tmp/x/skills", "a")] });

    const reloaded = new UserSkillSettingsStore({ filePath });
    expect(reloaded.get()).toEqual(next);
  });

  it("isEnabled reflects stored skill dirs", () => {
    const store = new UserSkillSettingsStore();
    store.applyUpdate({ customDirs: [], enabled: [path.join("/x", "skills", "a")] });
    expect(store.isEnabled(path.join("/x", "skills", "a"))).toBe(true);
    expect(store.isEnabled(path.join("/x", "skills", "b"))).toBe(false);
  });

  it("scan lists discovered skills with enabled flags", async () => {
    const skillDir = path.join(tmpDir, "local");
    fs.mkdirSync(path.join(skillDir, "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill\n---\n\nDo things.",
    );
    const store = new UserSkillSettingsStore({ filePath });
    store.applyUpdate({ customDirs: [skillDir], enabled: [path.join(skillDir, "demo")] });
    const result = await store.scan(tmpDir);
    const custom = result.sources.find((s) => s.custom);
    expect(custom?.exists).toBe(true);
    expect(custom?.skills).toEqual([
      { name: "demo", description: "Demo skill", dir: path.join(skillDir, "demo"), enabled: true },
    ]);
    expect(result.customDirs).toEqual([skillDir]);
  });
});
