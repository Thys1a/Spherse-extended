import { describe, it, expect } from "vitest";
import { toolOutputBudgetCapability } from "../../capabilities/tool-output-budget/index.js";
import { toolOutputBudgetProjector } from "../../capabilities/tool-output-budget/projector.js";
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

  it("registers as a capability with a contextProjector", () => {
    const capability = toolOutputBudgetCapability();
    expect(capability.id).toBe("tool-output-budget");
    expect(capability.contextProjectors).toHaveLength(1);
  });
});
