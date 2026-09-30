import { describe, it, expect } from "vitest";
import { toolOutputBudgetCapability } from "../../capabilities/tool-output-budget/index.js";
import { toolOutputBudgetProjector } from "../../capabilities/tool-output-budget/projector.js";
import { createPruningProjector } from "../../capabilities/tool-output-budget/pruning-projector.js";
import { MAX_OUTPUT_CHARS } from "../../tools/output-limits.js";

function toolResult(texts: string[]): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: "tc1",
    toolName: "read_file",
    content: texts.map((text) => ({ type: "text", text })),
    timestamp: 0,
  };
}

describe("toolOutputBudgetProjector", () => {
  const project = toolOutputBudgetProjector({} as never);

  it("passes through messages under budget untouched", () => {
    const messages = [
      { role: "user", content: "hi" },
      toolResult(["small output"]),
    ] as never[];
    const out = project(messages);
    expect(out).toEqual(messages);
    expect(out[0]).toBe(messages[0]);
    expect(out[1]).toBe(messages[1]);
  });

  it("caps a single oversized toolResult", () => {
    const big = "x".repeat(MAX_OUTPUT_CHARS + 100);
    const input = [toolResult([big])] as never[];
    const snapshot = structuredClone(input);
    const out = project(input) as Array<Record<string, any>>;
    const text = out[0].content[0].text as string;
    expect(text.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS + 100);
    expect(text).toContain("上下文预算");
    expect(out[0].content[0].text.startsWith("x".repeat(100))).toBe(true);
    expect(input).toEqual(snapshot);
  });

  it("caps across blocks and drops later text blocks", () => {
    const half = "y".repeat(Math.floor(MAX_OUTPUT_CHARS / 2) + 10);
    const out = project([toolResult([half, half, half])] as never[]) as Array<Record<string, any>>;
    const texts = out[0].content.filter((b: any) => b.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[1].text).toContain("上下文预算");
  });

  it("keeps non-text blocks and does not mutate the input", () => {
    const message = toolResult(["ok"]) as Record<string, any>;
    message.content.push({ type: "image", data: "blob" });
    const input = [message] as never[];
    const out = project(input);
    expect(out[0]).toBe(message);
  });

  it("registers as a capability with contextProjectors", () => {
    const capability = toolOutputBudgetCapability();
    expect(capability.id).toBe("tool-output-budget");
    expect(capability.contextProjectors).toHaveLength(2);
  });
});

describe("toolOutputPruningProjector", () => {
  function userTurn(prompt: string, toolOutput: string, toolName = "read_file"): Array<Record<string, unknown>> {
    return [
      { role: "user", content: prompt, timestamp: 0 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: `tc-${prompt}`, name: toolName, arguments: {} }],
        stopReason: "stop",
        timestamp: 0,
      },
      {
        role: "toolResult",
        toolCallId: `tc-${prompt}`,
        toolName,
        content: [{ type: "text", text: toolOutput }],
        timestamp: 0,
      },
    ];
  }

  function project(messages: Array<Record<string, unknown>>, keep = 5): Array<Record<string, any>> {
    return createPruningProjector(keep)({} as never)(messages as never[]) as Array<Record<string, any>>;
  }

  it("keeps a single turn untouched", () => {
    const messages = userTurn("hi", "small output");
    const out = project(messages);
    expect(out[2].content).toEqual([{ type: "text", text: "small output" }]);
  });

  it("prunes toolResults older than the last N segments", () => {
    const messages = [
      ...userTurn("t0", "old output zero"),
      ...userTurn("t1", "old output one"),
      ...userTurn("t2", "keep two"),
      ...userTurn("t3", "keep three"),
    ];
    const out = project(messages, 1);
    expect(out[2].content).toEqual([
      { type: "text", text: "[Output from read_file - 15 chars]" },
    ]);
    expect(out[5].content).toEqual([
      { type: "text", text: "[Output from read_file - 14 chars]" },
    ]);
    expect(out[8].content).toEqual([
      { type: "text", text: "[Output from read_file - 8 chars]" },
    ]);
    expect(out[11].content).toEqual([{ type: "text", text: "keep three" }]);
  });

  it("keeps isError on pruned messages", () => {
    const messages = [
      ...userTurn("t0", "failed output"),
      ...userTurn("t1", "x"),
      ...userTurn("t2", "y"),
    ];
    (messages[2] as Record<string, unknown>).isError = true;
    const out = project(messages, 1);
    expect(out[2].isError).toBe(true);
    expect((out[2].content[0] as any).text).toContain("Output from read_file");
  });

  it("prunes everything with keep 0 except the trailing segment", () => {
    const messages = [...userTurn("t0", "old"), ...userTurn("t1", "new")];
    const out = project(messages, 0);
    expect((out[2].content[0] as any).text).toContain("Output from read_file");
    expect(out[5].content).toEqual([{ type: "text", text: "new" }]);
  });

  it("counts a compaction digest as a segment boundary", () => {
    const messages = [
      { role: "user", content: "<compaction-digest>prior</compaction-digest>", timestamp: 0 },
      ...userTurn("t0", "old output"),
      ...userTurn("t1", "mid output"),
      ...userTurn("t2", "recent output"),
    ];
    const out = project(messages, 1);
    expect((out[3].content[0] as any).text).toContain("Output from read_file");
    expect((out[6].content[0] as any).text).toContain("Output from read_file");
    expect(out[9].content).toEqual([{ type: "text", text: "recent output" }]);
  });

  it("names mcp tools in the placeholder", () => {
    const messages = [
      ...userTurn("t0", "mcp blob", "mcp__srv__tool"),
      ...userTurn("t1", "x"),
      ...userTurn("t2", "y"),
    ];
    const out = project(messages, 1);
    expect((out[2].content[0] as any).text).toContain("mcp__srv__tool");
  });
});
