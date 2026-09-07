import { describe, expect, it, vi } from "vitest";
import {
  emitAssistantTurnComplete,
  extractLastAssistantText,
  onAssistantTurnComplete,
  turnSpeechText,
} from "./bridge";

describe("extractLastAssistantText", () => {
  it("returns the last non-error assistant message text", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "答案" }], stopReason: "stop" },
    ];
    expect(extractLastAssistantText(messages)).toBe("答案");
  });

  it("returns null when the last assistant turn is an error", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "错误" }], stopReason: "error" },
    ];
    expect(extractLastAssistantText(messages)).toBeNull();
  });

  it("returns null when there is no assistant message", () => {
    expect(extractLastAssistantText([{ role: "user", content: "hi" }])).toBeNull();
  });

  it("handles string content", () => {
    expect(extractLastAssistantText([{ role: "assistant", content: "纯文本" }])).toBe("纯文本");
  });
});

describe("turnSpeechText", () => {
  it("returns stripped speech text from the last assistant message", () => {
    const messages = [
      { role: "assistant", content: "这是**重点**内容", stopReason: "stop" },
    ];
    expect(turnSpeechText(messages)).toBe("这是重点内容");
  });

  it("returns empty string for an error turn", () => {
    const messages = [{ role: "assistant", content: "x", stopReason: "error" }];
    expect(turnSpeechText(messages)).toBe("");
  });
});

describe("onAssistantTurnComplete", () => {
  it("registers and unregisters handlers", () => {
    const handler = vi.fn();
    const off = onAssistantTurnComplete(handler);
    emitAssistantTurnComplete("s1", "text");
    expect(handler).toHaveBeenCalledWith("s1", "text");
    off();
    emitAssistantTurnComplete("s1", "text");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
