import { describe, expect, it } from "vitest";
import {
  isTruncatedTurn,
  markTruncated,
  readPromptEstimate,
  readUsageTotal,
} from "../../context/truncated-turn.js";

function thinkingOnly(): unknown {
  return {
    role: "assistant",
    stopReason: "length",
    content: [{ type: "thinking", thinking: "That" }],
  };
}

describe("isTruncatedTurn", () => {
  it("matches length with thinking-only content", () => {
    expect(isTruncatedTurn(thinkingOnly())).toBe(true);
  });

  it("matches length with non-array content", () => {
    expect(isTruncatedTurn({ role: "assistant", stopReason: "length" })).toBe(true);
  });

  it("rejects length with text", () => {
    expect(
      isTruncatedTurn({
        role: "assistant",
        stopReason: "length",
        content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "half" }],
      }),
    ).toBe(false);
  });

  it("rejects length with toolCall", () => {
    expect(
      isTruncatedTurn({
        role: "assistant",
        stopReason: "length",
        content: [{ type: "toolCall", id: "t1", name: "read_file", arguments: {} }],
      }),
    ).toBe(false);
  });

  it("rejects non-length stop reasons", () => {
    expect(
      isTruncatedTurn({ role: "assistant", stopReason: "stop", content: [] }),
    ).toBe(false);
    expect(
      isTruncatedTurn({ role: "assistant", stopReason: "error", content: [] }),
    ).toBe(false);
  });

  it("matches an already-marked message via rawStopReason", () => {
    const marked = markTruncated(thinkingOnly()) as { stopReason: string; rawStopReason: string };
    expect(marked.stopReason).toBe("error");
    expect(isTruncatedTurn(marked)).toBe(true);
  });

  it("rejects non-assistant messages", () => {
    expect(isTruncatedTurn({ role: "user", stopReason: "length", content: "hi" })).toBe(false);
    expect(isTruncatedTurn(null)).toBe(false);
  });
});

describe("markTruncated", () => {
  it("marks with error, rawStopReason and errorMessage", () => {
    const marked = markTruncated(thinkingOnly()) as Record<string, unknown>;
    expect(marked.stopReason).toBe("error");
    expect(marked.rawStopReason).toBe("length");
    expect(typeof marked.errorMessage).toBe("string");
    expect((marked.content as unknown[])).toHaveLength(1);
  });

  it("keeps an existing rawStopReason", () => {
    const marked = markTruncated({
      role: "assistant",
      stopReason: "length",
      rawStopReason: "length",
      content: [],
    }) as Record<string, unknown>;
    expect(marked.rawStopReason).toBe("length");
  });

  it("returns non-truncated messages untouched", () => {
    const message = { role: "assistant", stopReason: "stop", content: [] };
    expect(markTruncated(message)).toBe(message);
  });
});

describe("readPromptEstimate/readUsageTotal", () => {
  it("reads numeric fields only", () => {
    expect(readPromptEstimate({ promptEstimate: 123 })).toBe(123);
    expect(readPromptEstimate({})).toBeUndefined();
    expect(readUsageTotal({ usage: { totalTokens: 456 } })).toBe(456);
    expect(readUsageTotal({})).toBeUndefined();
  });
});
