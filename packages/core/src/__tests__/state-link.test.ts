import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addAgentDataLink,
  invalidateStateLinkCache,
  listAgentDataLinks,
  readAgentState,
  readStateDeclaration,
  removeAgentDataLink,
  renderStateBlock,
  stateProjector,
} from "../capabilities/data/index.js";
import { matchWorldbook, recentTextOf } from "../capabilities/card/index.js";
import type { CardEntry } from "../capabilities/card/types.js";

function dataFile(doc: unknown): string {
  return JSON.stringify(doc);
}

function wbEntry(overrides: Partial<CardEntry> = {}): CardEntry {
  return {
    id: 0,
    comment: "",
    keys: [],
    secondary_keys: [],
    content: "",
    constant: false,
    selective: false,
    enabled: true,
    position: 3,
    insertion_order: 0,
    use_regex: false,
    extensions: {},
    words: 0,
    ...overrides,
  };
}

describe("readStateDeclaration", () => {
  it("reads a valid declaration with label and enabled", () => {
    expect(readStateDeclaration({ $state: { path: "_state", label: "Game", enabled: true } })).toEqual({
      path: "_state",
      label: "Game",
      enabled: true,
    });
  });

  it("accepts a minimal declaration", () => {
    expect(readStateDeclaration({ $state: { path: "stats" } })).toEqual({ path: "stats" });
  });

  it("returns null for missing or malformed declarations", () => {
    expect(readStateDeclaration({})).toBeNull();
    expect(readStateDeclaration({ $state: null })).toBeNull();
    expect(readStateDeclaration({ $state: { label: "x" } })).toBeNull();
    expect(readStateDeclaration({ $state: { path: "" } })).toBeNull();
    expect(readStateDeclaration({ $state: { path: 42 } })).toBeNull();
    expect(readStateDeclaration(null)).toBeNull();
    expect(readStateDeclaration([])).toBeNull();
    expect(readStateDeclaration("doc")).toBeNull();
  });

  it("drops non-string labels instead of failing", () => {
    expect(readStateDeclaration({ $state: { path: "_state", label: 7 } })).toEqual({ path: "_state" });
  });
});

describe("renderStateBlock", () => {
  it("renders file/path/label attrs with escaped XML and pretty JSON", () => {
    const block = renderStateBlock("lore/game.data.json", { path: "_state", label: "A&B" }, { hp: 30 });
    expect(block).toContain('<state file="lore/game.data.json" path="_state" label="A&amp;B">');
    expect(block).toContain('"hp": 30');
    expect(block.endsWith("</state>")).toBe(true);
  });

  it("omits the label attr when absent and escapes quotes", () => {
    const block = renderStateBlock("g.data.json", { path: "s" }, null);
    expect(block).toContain('<state file="g.data.json" path="s">');
    expect(block).toContain("null");
    const quoted = renderStateBlock("g.data.json", { path: "s", label: 'say "hi"' }, 1);
    expect(quoted).toContain('label="say &quot;hi&quot;"');
  });
});

describe("data link validation (no symlinks needed)", () => {
  let root: string;
  let slugDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sl-data-links-"));
    slugDir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
    fs.mkdirSync(slugDir, { recursive: true });
    invalidateStateLinkCache();
  });

  afterEach(() => {
    invalidateStateLinkCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects traversal, non-data targets, and missing files", () => {
    expect(() => addAgentDataLink(root, "hero", "../outside.data.json")).toThrow();
    fs.writeFileSync(path.join(root, "lore", "notes.txt"), "plain");
    expect(() => addAgentDataLink(root, "hero", "lore/notes.txt")).toThrow();
    expect(() => addAgentDataLink(root, "hero", "lore/missing.data.json")).toThrow();
  });

  it("rejects invalid state_path and label at add time", () => {
    fs.writeFileSync(path.join(root, "lore", "game.data.json"), dataFile({ _state: {} }));
    expect(() => addAgentDataLink(root, "hero", "lore/game.data.json", { statePath: "$evil" })).toThrow();
    expect(() =>
      addAgentDataLink(root, "hero", "lore/game.data.json", { label: 7 as never }),
    ).toThrow();
  });

  it("remove refuses real files and missing links", () => {
    fs.writeFileSync(path.join(slugDir, "real.data.json"), dataFile({}));
    expect(() => removeAgentDataLink(root, "hero", "real.data.json")).toThrow();
    expect(() => removeAgentDataLink(root, "hero", "ghost.data.json")).toThrow();
    expect(fs.existsSync(path.join(slugDir, "real.data.json"))).toBe(true);
  });

  it("rejects unsafe link names", () => {
    expect(() => removeAgentDataLink(root, "hero", "../x.data.json")).toThrow();
    expect(() => removeAgentDataLink(root, "hero", "sub/x.data.json")).toThrow();
    expect(() => removeAgentDataLink(root, "hero", "x.txt")).toThrow();
  });
});

function canCreateSymlinks(): boolean {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "sl-link-probe-"));
  try {
    fs.symlinkSync(path.join(probe, "t"), path.join(probe, "l"), "file");
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

describe.runIf(canCreateSymlinks())("agent data links", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sl-data-links-"));
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
    invalidateStateLinkCache();
  });

  afterEach(() => {
    invalidateStateLinkCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function outsideData(name: string, doc: unknown): string {
    const rel = path.join("lore", name);
    fs.writeFileSync(path.join(root, rel), dataFile(doc));
    return rel;
  }

  it("add writes a default _state declaration and list/remove round-trip", () => {
    const rel = outsideData("game.data.json", { gold: 10 });
    const added = addAgentDataLink(root, "hero", rel);
    expect(added).toMatchObject({ name: "game.data.json", dangling: false, hasState: true });
    expect(added.target).toBe(path.join("lore", "game.data.json").replace(/\\/g, "/"));
    expect(added.statePath).toBe("_state");
    expect(added.estimatedTokens).toBeGreaterThan(0);
    const targetDoc = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
    expect(targetDoc.$state).toEqual({ path: "_state" });
    expect(targetDoc._state).toEqual({});
    expect(targetDoc.gold).toBe(10);
    expect(listAgentDataLinks(root, "hero")).toHaveLength(1);
    removeAgentDataLink(root, "hero", "game.data.json");
    expect(listAgentDataLinks(root, "hero")).toHaveLength(0);
    expect(fs.existsSync(path.join(root, rel))).toBe(true);
    expect(fs.readFileSync(path.join(root, rel), "utf8")).toContain("$state");
  });

  it("add preserves an existing declaration instead of overwriting", () => {
    const rel = outsideData("game.data.json", {
      $state: { path: "stats", label: "Mine", enabled: false },
      stats: { hp: 3 },
    });
    const added = addAgentDataLink(root, "hero", rel);
    expect(added.statePath).toBe("stats");
    expect(added.hasState).toBe(false);
    const targetDoc = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
    expect(targetDoc.$state).toEqual({ path: "stats", label: "Mine", enabled: false });
  });

  it("add honors an explicit statePath and label", () => {
    const rel = outsideData("game.data.json", { stats: { hp: 30 } });
    const added = addAgentDataLink(root, "hero", rel, { statePath: "stats", label: "RPG" });
    expect(added).toMatchObject({ statePath: "stats", hasState: true });
    const targetDoc = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
    expect(targetDoc.$state).toEqual({ path: "stats", label: "RPG" });
  });

  it("treats blank state_path and label as absent", () => {
    const rel = outsideData("game.data.json", { gold: 1 });
    const added = addAgentDataLink(root, "hero", rel, { statePath: "  ", label: "" });
    expect(added).toMatchObject({ statePath: "_state", hasState: true });
    const targetDoc = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
    expect(targetDoc.$state).toEqual({ path: "_state" });
  });

  it("add is idempotent for the same target", () => {
    const rel = outsideData("game.data.json", {});
    addAgentDataLink(root, "hero", rel);
    expect(addAgentDataLink(root, "hero", rel)).toMatchObject({ name: "game.data.json" });
    expect(listAgentDataLinks(root, "hero")).toHaveLength(1);
  });

  it("lists links sorted by name", () => {
    const relB = outsideData("b.data.json", { _state: {}, $state: { path: "_state" } });
    const relA = outsideData("a.data.json", { _state: {}, $state: { path: "_state" } });
    addAgentDataLink(root, "hero", relB);
    addAgentDataLink(root, "hero", relA);
    expect(listAgentDataLinks(root, "hero").map((l) => l.name)).toEqual([
      "a.data.json",
      "b.data.json",
    ]);
  });

  it("leaves a declared-less link behind when the target is not valid JSON", () => {
    const rel = path.join("lore", "broken.data.json");
    fs.writeFileSync(path.join(root, rel), "{oops");
    expect(() => addAgentDataLink(root, "hero", rel)).toThrow(/valid JSON/);
    expect(listAgentDataLinks(root, "hero")).toMatchObject([{ name: "broken.data.json", hasState: false }]);
    expect(readAgentState(root, "hero")).toHaveLength(0);
  });

  it("add conflicts on same name with different target", () => {
    const rel1 = outsideData("a.data.json", {});
    fs.mkdirSync(path.join(root, "lore2"), { recursive: true });
    fs.writeFileSync(path.join(root, "lore2", "a.data.json"), dataFile({}));
    addAgentDataLink(root, "hero", rel1);
    expect(() => addAgentDataLink(root, "hero", path.join("lore2", "a.data.json"))).toThrow(
      /already exists/,
    );
  });

  it("reader follows links and sees target edits without invalidation", () => {
    const rel = outsideData("game.data.json", { _state: { day: 1 }, $state: { path: "_state" } });
    addAgentDataLink(root, "hero", rel);
    expect(readAgentState(root, "hero").map((b) => b.value)).toEqual([{ day: 1 }]);
    fs.writeFileSync(path.join(root, rel), dataFile({ _state: { day: 2 }, $state: { path: "_state" } }));
    expect(readAgentState(root, "hero").map((b) => b.value)).toEqual([{ day: 2 }]);
  });

  it("reader skips dangling and outside-project links", () => {
    const rel = outsideData("game.data.json", {});
    addAgentDataLink(root, "hero", rel);
    fs.unlinkSync(path.join(root, rel));
    expect(readAgentState(root, "hero")).toHaveLength(0);
    expect(listAgentDataLinks(root, "hero")[0]).toMatchObject({
      dangling: true,
      hasState: false,
      estimatedTokens: 0,
    });
  });

  it("list keeps the declared path for disabled or missing-node links", () => {
    const off = outsideData("off.data.json", { _state: {}, $state: { path: "_state", enabled: false } });
    addAgentDataLink(root, "hero", off);
    // 缺失节点必须手工建链：走 add() 会被 ensureStateDeclaration 自动补上空节点
    const ghostRel = path.join("lore", "ghost.data.json");
    fs.writeFileSync(path.join(root, ghostRel), dataFile({ $state: { path: "nope" } }));
    const dir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(path.relative(dir, path.join(root, ghostRel)), path.join(dir, "ghost.data.json"), "file");
    expect(listAgentDataLinks(root, "hero")).toMatchObject([
      { name: "ghost.data.json", hasState: false, statePath: "nope", estimatedTokens: 0 },
      { name: "off.data.json", hasState: false, statePath: "_state", estimatedTokens: 0 },
    ]);
    expect(readAgentState(root, "hero")).toHaveLength(0);
  });

  it("reader ignores regular files in the agent dir", () => {
    const dir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "plain.data.json"), dataFile({ _state: { x: 1 } }));
    expect(listAgentDataLinks(root, "hero")).toHaveLength(0);
    expect(readAgentState(root, "hero")).toHaveLength(0);
  });

  it("add rejects symlink-hop targets escaping the project", () => {
    const hop = path.join("lore", "hop.data.json");
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-data-outside-"));
    try {
      fs.writeFileSync(path.join(outsideDir, "evil.data.json"), dataFile({}));
      fs.symlinkSync(path.join(outsideDir, "evil.data.json"), path.join(root, hop), "file");
      expect(() => addAgentDataLink(root, "hero", hop)).toThrow(/escapes project/);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("list marks manually created outside-project links as dangling", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-data-outside-"));
    try {
      fs.writeFileSync(path.join(outsideDir, "evil.data.json"), dataFile({}));
      const dir = path.join(root, ".spherse", "agents", "hero");
      fs.mkdirSync(dir, { recursive: true });
      fs.symlinkSync(path.join(outsideDir, "evil.data.json"), path.join(dir, "evil.data.json"), "file");
      expect(listAgentDataLinks(root, "hero")).toMatchObject([
        { name: "evil.data.json", dangling: true },
      ]);
      expect(readAgentState(root, "hero")).toHaveLength(0);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("list refreshes token stats after target edits without invalidation", () => {
    const rel = outsideData("game.data.json", { _state: { a: 1 }, $state: { path: "_state" } });
    addAgentDataLink(root, "hero", rel);
    const before = listAgentDataLinks(root, "hero")[0].estimatedTokens;
    fs.writeFileSync(
      path.join(root, rel),
      dataFile({ _state: { a: 1, log: "a considerably longer piece of content here" }, $state: { path: "_state" } }),
    );
    const after = listAgentDataLinks(root, "hero")[0];
    expect(after.estimatedTokens).toBeGreaterThan(before);
  });
});

describe.runIf(canCreateSymlinks())("stateProjector", () => {
  let root: string;
  let slugDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sl-projector-"));
    slugDir = path.join(root, ".spherse", "agents", "hero");
    fs.mkdirSync(slugDir, { recursive: true });
    fs.mkdirSync(path.join(root, "lore"), { recursive: true });
    invalidateStateLinkCache();
  });

  afterEach(() => {
    invalidateStateLinkCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function view() {
    return {
      agentId: "a1",
      profile: { slug: "hero" },
      projectStore: { getRootPath: () => root },
    } as never;
  }

  function linkTarget(rel: string, doc: unknown): void {
    fs.writeFileSync(path.join(root, rel), dataFile(doc));
    fs.mkdirSync(slugDir, { recursive: true });
    fs.symlinkSync(
      path.relative(slugDir, path.join(root, rel)),
      path.join(slugDir, path.basename(rel)),
      "file",
    );
  }

  function messages(text: string) {
    return [{ role: "user", content: text } as never];
  }

  it("inserts the state block before the current user message", () => {
    linkTarget(path.join("lore", "game.data.json"), { _state: { day: 3 }, $state: { path: "_state" } });
    const out = stateProjector(view())!(messages("what is the day"));
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
    const content = (out[0] as { content: string }).content;
    expect(content).toContain("<state");
    expect(content).toContain('file="lore/game.data.json"');
    expect(content).toContain('"day": 3');
    expect((out[1] as { content: string }).content).toBe("what is the day");
  });

  it("inserts at the front when there is no user message", () => {
    linkTarget(path.join("lore", "game.data.json"), { _state: { day: 3 }, $state: { path: "_state" } });
    const history = [{ role: "assistant", content: "hi" } as never];
    const out = stateProjector(view())!(history);
    expect(out).toHaveLength(2);
    expect((out[0] as { content: string }).content).toContain("<state");
  });

  it("skips links without declarations, disabled, or missing nodes", () => {
    linkTarget(path.join("lore", "plain.data.json"), { _state: { day: 1 } });
    linkTarget(path.join("lore", "off.data.json"), {
      _state: { day: 1 },
      $state: { path: "_state", enabled: false },
    });
    linkTarget(path.join("lore", "ghost.data.json"), { $state: { path: "nope" } });
    const out = stateProjector(view())!(messages("hello"));
    expect(out).toHaveLength(1);
  });

  it("emits blocks sorted by link name across multiple links", () => {
    linkTarget(path.join("lore", "b.data.json"), { _state: { n: "b" }, $state: { path: "_state" } });
    linkTarget(path.join("lore", "a.data.json"), { _state: { n: "a" }, $state: { path: "_state" } });
    const out = stateProjector(view())!(messages("hello"));
    expect(out).toHaveLength(2);
    const content = (out[0] as { content: string }).content;
    expect(content.indexOf('file="lore/a.data.json"')).toBeLessThan(
      content.indexOf('file="lore/b.data.json"'),
    );
  });

  it("leaves messages untouched without links", () => {
    const out = stateProjector(view())!(messages("hello"));
    expect(out).toHaveLength(1);
    expect((out[0] as { content: string }).content).toBe("hello");
  });

  it("state content cannot retrigger worldbook matching", () => {
    linkTarget(path.join("lore", "game.data.json"), {
      _state: { rumor: "Winterfell castle" },
      $state: { path: "_state" },
    });
    const out = stateProjector(view())!(messages("we march on"));
    const text = recentTextOf(out);
    expect(text).not.toContain("Winterfell");
    expect(
      matchWorldbook(text, [wbEntry({ keys: ["Winterfell"], content: "The castle." })]),
    ).toHaveLength(0);
  });
});
