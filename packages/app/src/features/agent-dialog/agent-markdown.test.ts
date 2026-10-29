import { describe, expect, it } from "vitest";
import {
  MAX_QUICK_REPLIES as CORE_MAX_QUICK_REPLIES,
  MAX_QUICK_REPLY_LABEL_LENGTH as CORE_MAX_LABEL_LENGTH,
} from "@spherse/core";
import {
  buildAgentMarkdown,
  MAX_QUICK_REPLIES,
  MAX_QUICK_REPLY_LABEL_LENGTH,
  parseAgentMarkdown,
} from "./agent-markdown";

describe("parseAgentMarkdown", () => {
  it("returns empty tools when there is no frontmatter block", () => {
    const result = parseAgentMarkdown("# Title\n\nbody text");
    expect(result.formData.tools).toEqual([]);
    expect(result.formData.systemPrompt).toBe("# Title\n\nbody text");
    expect(result.formData.yolo).toBe(false);
  });

  it("returns empty tools when the tools field is missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual([]);
    expect(result.formData.name).toBe("Agent");
  });

  it("returns empty tools when the tools field is null", () => {
    const raw = "---\nname: Agent\ntools:\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual([]);
  });

  it("returns empty tools when tools is an empty array", () => {
    const raw = "---\nname: Agent\ntools: []\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual([]);
  });

  it("parses an explicit tools array", () => {
    const raw = "---\nname: Agent\ntools:\n  - read_file\n  - write_file\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual(["read_file", "write_file"]);
  });

  it("filters out non-string entries in the tools array", () => {
    const raw = "---\nname: Agent\ntools:\n  - read_file\n  - 123\n  - write_file\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual(["read_file", "write_file"]);
  });

  it("parses context array when present", () => {
    const raw = "---\nname: Agent\ncontext:\n  - file1.md\n  - file2.md\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.context).toEqual(["file1.md", "file2.md"]);
  });

  it("returns empty context when missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.context).toEqual([]);
  });

  it("parses quickLinks array when present", () => {
    const raw = "---\nname: Agent\nquickLinks:\n  - notes/world.md\n  - chars/hero.md\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickLinks).toEqual(["notes/world.md", "chars/hero.md"]);
    expect(result.extraFrontmatter).not.toHaveProperty("quickLinks");
  });

  it("returns empty quickLinks when missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickLinks).toEqual([]);
  });

  it("filters non-string entries in the quickLinks array", () => {
    const raw = "---\nname: Agent\nquickLinks:\n  - a.md\n  - 42\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickLinks).toEqual(["a.md"]);
  });

  it("parses quickReplies array when present", () => {
    const raw = "---\nname: Agent\nquickReplies:\n  - label: Hi\n    description: Say hi\n    text: hello\n    action: fill\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickReplies).toEqual([
      { label: "Hi", description: "Say hi", text: "hello", action: "fill" },
    ]);
    expect(result.extraFrontmatter).not.toHaveProperty("quickReplies");
  });

  it("returns empty quickReplies when missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickReplies).toEqual([]);
  });

  it("drops invalid quickReplies entries and caps the list", () => {
    const items = Array.from({ length: 12 }, (_, i) => `  - label: R${i}\n    text: t${i}`).join("\n");
    const raw = `---\nname: Agent\nquickReplies:\n${items}\n  - 42\n  - label: ''\n    text: empty\n---\n\nsystem prompt`;
    const result = parseAgentMarkdown(raw);
    expect(result.formData.quickReplies).toHaveLength(10);
    expect(result.formData.quickReplies?.[0]).toEqual({ label: "R0", text: "t0", action: "fill" });
  });

  it("writes quickReplies back into frontmatter and round-trips", () => {
    const { formData } = parseAgentMarkdown("---\nname: Agent\n---\n\nprompt");
    const out = buildAgentMarkdown(
      { ...formData, quickReplies: [{ label: "Hi", text: "hello", action: "fill" }] },
      {},
      false,
    );
    expect(out).toContain("quickReplies:");
    expect(parseAgentMarkdown(out).formData.quickReplies).toEqual([
      { label: "Hi", text: "hello", action: "fill" },
    ]);
  });

  it("mirrors core quick-reply limits", () => {
    expect(MAX_QUICK_REPLIES).toBe(CORE_MAX_QUICK_REPLIES);
    expect(MAX_QUICK_REPLY_LABEL_LENGTH).toBe(CORE_MAX_LABEL_LENGTH);
  });

  it("parses alias when present", () => {
    const raw = "---\nname: Agent\nalias: 小明\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.alias).toBe("小明");
  });

  it("returns undefined alias when missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.alias).toBeUndefined();
  });

  it("does not leak alias into extra frontmatter", () => {
    const raw = "---\nname: Agent\nalias: 小明\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("alias");
  });

  it("returns undefined alias when value is not a string", () => {
    const raw = "---\nname: Agent\nalias: 123\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.alias).toBeUndefined();
  });

  it("returns undefined alias when value is whitespace-only", () => {
    const raw = "---\nname: Agent\nalias: '   '\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.alias).toBeUndefined();
  });

  it("keeps unknown extra frontmatter keys separate from form data", () => {
    const raw = "---\nname: Agent\nautoRun: true\ncustomKey: 42\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).toEqual({ autoRun: true, customKey: 42 });
  });

  it("parses model into form data as a first-class field", () => {
    const raw = "---\nname: Agent\nmodel: openai/gpt-4o\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.model).toBe("openai/gpt-4o");
    expect(result.extraFrontmatter).not.toHaveProperty("model");
  });

  it("parses placeholder and greeting into form data", () => {
    const raw = "---\nname: Agent\nplaceholder: 输入消息…\ngreeting: 你好，我是小助手\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.placeholder).toBe("输入消息…");
    expect(result.formData.greeting).toBe("你好，我是小助手");
    expect(result.extraFrontmatter).not.toHaveProperty("placeholder");
    expect(result.extraFrontmatter).not.toHaveProperty("greeting");
  });

  it("returns undefined placeholder/greeting when missing or blank", () => {
    const missing = parseAgentMarkdown("---\nname: Agent\n---\n\nsystem prompt");
    expect(missing.formData.placeholder).toBeUndefined();
    expect(missing.formData.greeting).toBeUndefined();
    const blank = parseAgentMarkdown("---\nname: Agent\nplaceholder: '   '\n---\n\nsystem prompt");
    expect(blank.formData.placeholder).toBeUndefined();
  });

  it("returns undefined model when missing or empty", () => {
    expect(parseAgentMarkdown("---\nname: Agent\n---\n\np").formData.model).toBeUndefined();
    expect(parseAgentMarkdown("---\nname: Agent\nmodel: ''\n---\n\np").formData.model).toBeUndefined();
    expect(parseAgentMarkdown("---\nname: Agent\nmodel: 123\n---\n\np").formData.model).toBeUndefined();
  });

  it("returns undefined model when whitespace-only", () => {
    const raw = "---\nname: Agent\nmodel: '   '\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.model).toBeUndefined();
  });

  it("does not leak model into extra frontmatter", () => {
    const raw = "---\nname: Agent\nmodel: openai/gpt-4o\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("model");
  });

  it("parses thinkingLevel when present", () => {
    const raw = "---\nname: Agent\nthinkingLevel: high\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.thinkingLevel).toBe("high");
  });

  it("ignores invalid thinkingLevel values", () => {
    const raw = "---\nname: Agent\nthinkingLevel: extreme\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.thinkingLevel).toBeUndefined();
    expect(result.extraFrontmatter).not.toHaveProperty("thinkingLevel");
  });

  it("handles CRLF line endings", () => {
    const raw = "---\r\nname: Agent\r\ntools:\r\n  - read_file\r\n---\r\n\r\nsystem prompt\r\n";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.tools).toEqual(["read_file"]);
    expect(result.formData.name).toBe("Agent");
  });

  it("returns undefined timePerception when field is missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.timePerception).toBeUndefined();
  });

  it("parses timePerception when present", () => {
    const raw = [
      "---",
      "name: Agent",
      "timePerception:",
      "  enabled: true",
      "  epochMs: 1700000000000",
      "  startMs: 1600000000000",
      "  flowRate: 60",
      "  timeZone: Asia/Shanghai",
      "---",
      "",
      "system prompt",
    ].join("\n");
    const result = parseAgentMarkdown(raw);
    expect(result.formData.timePerception).toEqual({
      enabled: true,
      epochMs: 1700000000000,
      startMs: 1600000000000,
      flowRate: 60,
      timeZone: "Asia/Shanghai",
    });
  });

  it("does not leak timePerception into extra frontmatter", () => {
    const raw = "---\nname: Agent\ntimePerception:\n  enabled: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("timePerception");
  });

  it("returns false yolo when field is missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.yolo).toBe(false);
  });

  it("parses yolo true when present", () => {
    const raw = "---\nname: Agent\nyolo: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.yolo).toBe(true);
  });

  it("parses yolo false when explicitly false", () => {
    const raw = "---\nname: Agent\nyolo: false\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.yolo).toBe(false);
  });

  it("parses allowInlineHtml true when present", () => {
    const raw = "---\nname: Agent\nallowInlineHtml: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.allowInlineHtml).toBe(true);
  });

  it("returns false allowInlineHtml when field is missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.allowInlineHtml).toBe(false);
  });

  it("does not leak allowInlineHtml into extra frontmatter", () => {
    const raw = "---\nname: Agent\nallowInlineHtml: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("allowInlineHtml");
  });

  it("does not leak yolo into extra frontmatter", () => {
    const raw = "---\nname: Agent\nyolo: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("yolo");
  });

  it("parses unlimitedAsk/unlimitedToolCalls true when present", () => {
    const raw = "---\nname: Agent\nunlimitedAsk: true\nunlimitedToolCalls: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.unlimitedAsk).toBe(true);
    expect(result.formData.unlimitedToolCalls).toBe(true);
  });

  it("returns false unlimited flags when fields are missing", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.unlimitedAsk).toBe(false);
    expect(result.formData.unlimitedToolCalls).toBe(false);
  });

  it("does not leak unlimited flags into extra frontmatter", () => {
    const raw = "---\nname: Agent\nunlimitedAsk: true\nunlimitedToolCalls: true\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.extraFrontmatter).not.toHaveProperty("unlimitedAsk");
    expect(result.extraFrontmatter).not.toHaveProperty("unlimitedToolCalls");
  });

  it("returns undefined skills when the field is missing (allowlist defaults to all-on)", () => {
    const raw = "---\nname: Agent\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.skills).toBeUndefined();
    expect(result.extraFrontmatter).not.toHaveProperty("skills");
  });

  it("parses an explicit skills allowlist", () => {
    const raw = "---\nname: Agent\nskills:\n  - research\n  - writing\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.skills).toEqual(["research", "writing"]);
    expect(result.extraFrontmatter).not.toHaveProperty("skills");
  });

  it("parses an empty skills list as an explicit all-off", () => {
    const raw = "---\nname: Agent\nskills: []\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.skills).toEqual([]);
  });

  it("returns undefined skills when the value is not an array", () => {
    const raw = "---\nname: Agent\nskills: research\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.skills).toBeUndefined();
  });

  it("filters non-string entries in the skills array", () => {
    const raw = "---\nname: Agent\nskills:\n  - research\n  - 42\n---\n\nsystem prompt";
    const result = parseAgentMarkdown(raw);
    expect(result.formData.skills).toEqual(["research"]);
  });
});

describe("buildAgentMarkdown", () => {
  it("writes tools array into frontmatter", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: ["read_file"], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.tools).toEqual(["read_file"]);
    expect(parsed.formData.systemPrompt).toBe("hello");
  });

  it("omits context when empty", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("context");
  });

  it("writes quickLinks into frontmatter and round-trips", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: ["notes/world.md"], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).toContain("quickLinks");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.quickLinks).toEqual(["notes/world.md"]);
  });

  it("omits quickLinks from frontmatter when empty", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("quickLinks");
  });

  it("preserves empty tools array through a round-trip", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.tools).toEqual([]);
  });

  it("writes alias into frontmatter when set", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", alias: "小明", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.alias).toBe("小明");
  });

  it("omits alias from frontmatter when empty", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", alias: "", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("alias");
  });

  it("omits alias from frontmatter when whitespace-only", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", alias: "   ", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("alias");
  });

  it("round-trips placeholder and greeting through frontmatter", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, placeholder: "输入消息…", greeting: "你好" },
      {},
      false,
    );
    expect(md).toContain("placeholder");
    expect(md).toContain("greeting");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.placeholder).toBe("输入消息…");
    expect(parsed.formData.greeting).toBe("你好");
  });

  it("omits blank placeholder/greeting from frontmatter", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, placeholder: "  ", greeting: "" },
      {},
      false,
    );
    expect(md).not.toContain("placeholder");
    expect(md).not.toContain("greeting");
  });

  it("preserves alias through a round-trip with extra frontmatter", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", alias: "小明", tools: ["read_file"], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      { autoRun: true },
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.alias).toBe("小明");
    expect(parsed.extraFrontmatter).toEqual({ autoRun: true });
    expect(parsed.extraFrontmatter).not.toHaveProperty("alias");
  });

  it("writes model into frontmatter when set", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, model: "gpt-4" },
      {},
      false,
    );
    expect(md).toContain("model");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.model).toBe("gpt-4");
    expect(parsed.extraFrontmatter).not.toHaveProperty("model");
  });

  it("omits model from frontmatter when not set", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("model");
  });

  it("omits model from frontmatter when whitespace-only", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, model: "   " },
      {},
      false,
    );
    expect(md).not.toContain("model");
  });

  it("does not double-write model when it is both form data and extra", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, model: "gpt-4" },
      { model: "claude" },
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.model).toBe("gpt-4");
  });

  it("writes model and thinkingLevel into frontmatter when set", () => {
    const md = buildAgentMarkdown(
      {
        name: "Agent",
        model: "openai/gpt-4o",
        thinkingLevel: "high",
        tools: [],
        context: [],
        quickLinks: [],
        systemPrompt: "hello",
        yolo: false,
        allowInlineHtml: false,
        unlimitedAsk: false,
        unlimitedToolCalls: false,
      },
      {},
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.model).toBe("openai/gpt-4o");
    expect(parsed.formData.thinkingLevel).toBe("high");
  });

  it("omits model and thinkingLevel when unset", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("model:");
    expect(md).not.toContain("thinkingLevel:");
  });

  it("drops a previously set model when cleared", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", model: undefined, thinkingLevel: undefined, tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("model:");
    expect(md).not.toContain("thinkingLevel:");
  });

  it("writes timePerception when enabled", () => {
    const md = buildAgentMarkdown(
      {
        name: "Agent",
        tools: [],
        context: [],
        quickLinks: [],
        systemPrompt: "hello",
        yolo: false, allowInlineHtml: false,
        unlimitedAsk: false, unlimitedToolCalls: false,
        timePerception: {
          enabled: true,
          epochMs: 1700000000000,
          startMs: 1600000000000,
          flowRate: 60,
          timeZone: "Asia/Shanghai",
        },
      },
      {},
      false,
    );
    expect(md).toContain("timePerception");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.timePerception).toEqual({
      enabled: true,
      epochMs: 1700000000000,
      startMs: 1600000000000,
      flowRate: 60,
      timeZone: "Asia/Shanghai",
    });
  });

  it("omits timePerception when disabled", () => {
    const md = buildAgentMarkdown(
      {
        name: "Agent",
        tools: [],
        context: [],
        quickLinks: [],
        systemPrompt: "hello",
        yolo: false, allowInlineHtml: false,
        unlimitedAsk: false, unlimitedToolCalls: false,
        timePerception: { enabled: false, epochMs: 1700000000000 },
      },
      {},
      false,
    );
    expect(md).not.toContain("timePerception");
  });

  it("writes yolo into frontmatter when true", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: true, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).toContain("yolo");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.yolo).toBe(true);
  });

  it("omits yolo from frontmatter when false", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("yolo");
  });

  it("writes allowInlineHtml into frontmatter when true", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: true, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).toContain("allowInlineHtml");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.allowInlineHtml).toBe(true);
  });

  it("omits allowInlineHtml from frontmatter when false", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("allowInlineHtml");
  });

  it("writes unlimited flags into frontmatter when true", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: true, unlimitedToolCalls: true },
      {},
      false,
    );
    expect(md).toContain("unlimitedAsk");
    expect(md).toContain("unlimitedToolCalls");
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.unlimitedAsk).toBe(true);
    expect(parsed.formData.unlimitedToolCalls).toBe(true);
  });

  it("omits unlimited flags from frontmatter when false", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false },
      {},
      false,
    );
    expect(md).not.toContain("unlimitedAsk");
    expect(md).not.toContain("unlimitedToolCalls");
  });

  it("omits skills from frontmatter when undefined (all-on)", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, skills: undefined },
      {},
      false,
    );
    expect(md).not.toContain("skills");
  });

  it("writes an empty skills list as an explicit all-off and round-trips", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, skills: [] },
      {},
      false,
    );
    expect(md).toContain("skills");
    expect(parseAgentMarkdown(md).formData.skills).toEqual([]);
  });

  it("writes a partial skills allowlist and round-trips", () => {
    const md = buildAgentMarkdown(
      { name: "Agent", tools: [], context: [], quickLinks: [], systemPrompt: "hello", yolo: false, allowInlineHtml: false, unlimitedAsk: false, unlimitedToolCalls: false, skills: ["research"] },
      {},
      false,
    );
    const parsed = parseAgentMarkdown(md);
    expect(parsed.formData.skills).toEqual(["research"]);
    expect(parsed.extraFrontmatter).not.toHaveProperty("skills");
  });
});
