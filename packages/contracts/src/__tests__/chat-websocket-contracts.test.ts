import { describe, expect, it } from "vitest";
import {
  parseChatClientMessage,
  parseChatReplayEvent,
  parseChatServerEvent,
} from "../index.js";

describe("chat websocket control contract", () => {
  it("accepts question control_request server event", () => {
    const event = {
      type: "control_request",
      requestId: "req1",
      kind: "question",
      toolCallId: "call1",
      toolName: "ask_user",
      args: { question: "Which option?" },
    };
    expect(parseChatServerEvent(event)).toEqual(event);
  });

  it("accepts question control_resolved server event with answer", () => {
    const event = {
      type: "control_resolved",
      requestId: "req1",
      kind: "question",
      answer: "the first one",
      timedOut: false,
    };
    expect(parseChatServerEvent(event)).toEqual(event);
  });

  it("accepts question control_resolved server event without answer", () => {
    const event = {
      type: "control_resolved",
      requestId: "req2",
      kind: "question",
      timedOut: true,
    };
    expect(parseChatServerEvent(event)).toEqual(event);
  });

  it("keeps approval control server events parsing", () => {
    const request = {
      type: "control_request",
      requestId: "req3",
      kind: "approval",
      toolCallId: "call2",
      toolName: "run_command",
      args: { command: "ls" },
    };
    expect(parseChatServerEvent(request)).toEqual(request);
    const resolved = {
      type: "control_resolved",
      requestId: "req3",
      kind: "approval",
      approved: false,
      reason: "not allowed",
    };
    expect(parseChatServerEvent(resolved)).toEqual(resolved);
  });

  it("rejects malformed control server events", () => {
    expect(() =>
      parseChatServerEvent({ type: "control_request", kind: "question" }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatServerEvent({
        type: "control_request",
        requestId: "req1",
        kind: "question",
        toolCallId: "call1",
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatServerEvent({
        type: "control_resolved",
        requestId: "req1",
        kind: "question",
        answer: "yes",
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatServerEvent({
        type: "control_request",
        requestId: "req1",
        kind: "unknown",
        toolCallId: "call1",
        toolName: "ask_user",
        args: {},
      }),
    ).toThrow(/Invalid payload/);
  });

  it("accepts resolve_control_request with approval payload", () => {
    expect(
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req1",
        kind: "approval",
        approved: true,
      }),
    ).toEqual({
      type: "resolve_control_request",
      requestId: "req1",
      kind: "approval",
      approved: true,
    });
    expect(
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req1",
        kind: "approval",
        approved: false,
        reason: "nope",
      }),
    ).toEqual({
      type: "resolve_control_request",
      requestId: "req1",
      kind: "approval",
      approved: false,
      reason: "nope",
    });
  });

  it("accepts resolve_control_request with question payload", () => {
    expect(
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req2",
        kind: "question",
        answer: "go with option B",
      }),
    ).toEqual({
      type: "resolve_control_request",
      requestId: "req2",
      kind: "question",
      answer: "go with option B",
    });
  });

  it("rejects question resolve_control_request without answer", () => {
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req2",
        kind: "question",
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req2",
        kind: "question",
        answer: 42,
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req2",
        kind: "question",
        answer: "",
      }),
    ).toThrow(/Invalid payload/);
  });

  it("rejects approval resolve_control_request without approved", () => {
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req1",
        kind: "approval",
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req1",
        kind: "approval",
        reason: "nope",
      }),
    ).toThrow(/Invalid payload/);
  });

  it("rejects resolve_control_request with unknown kind", () => {
    expect(() =>
      parseChatClientMessage({
        type: "resolve_control_request",
        requestId: "req1",
        kind: "unknown",
        answer: "x",
      }),
    ).toThrow(/Invalid payload/);
  });

  it("accepts withdraw client message", () => {
    expect(parseChatClientMessage({ type: "withdraw" })).toEqual({
      type: "withdraw",
    });
  });

  it("accepts turn_withdrawn server event", () => {
    const event = { type: "turn_withdrawn", seq: 3 };
    expect(parseChatServerEvent(event)).toEqual(event);
  });

  it("accepts user_message with slash and summon metadata", () => {
    const event = {
      type: "user_message",
      seq: 4,
      message: { role: "user", content: "hi", timestamp: 1 },
      slash: { type: "skill", name: "review", rawArgs: "x" },
      summon: { agentId: "a9", sessionId: "s9", agentName: "Builder" },
    };
    expect(parseChatServerEvent({ ...event, source: "summon" })).toEqual({
      ...event,
      source: "summon",
    });
  });

  it("rejects turn_withdrawn without seq", () => {
    expect(() => parseChatServerEvent({ type: "turn_withdrawn" })).toThrow(
      /Invalid payload/,
    );
    expect(() =>
      parseChatServerEvent({ type: "turn_withdrawn", seq: "3" }),
    ).toThrow(/Invalid payload/);
  });
});

describe("chat replay tool/result sideEffects (R2.5a)", () => {
  const message = {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "mutate_data",
    content: [],
    details: { path: "board.data.json", version: "v1" },
    isError: false,
    timestamp: 1,
  };

  it("accepts tool/result with sideEffects", () => {
    const event = {
      type: "tool/result",
      seq: 5,
      time: 1,
      data: {
        message,
        sideEffects: [{ type: "data", file: "board.data.json", version: "v1" }],
      },
    };
    expect(parseChatReplayEvent(event)).toEqual(event);
  });

  it("accepts tool/result without sideEffects", () => {
    const event = { type: "tool/result", seq: 5, time: 1, data: { message } };
    expect(parseChatReplayEvent(event)).toEqual(event);
  });

  it("accepts tool/result with undo-enriched sideEffects", () => {
    const event = {
      type: "tool/result",
      seq: 5,
      time: 1,
      data: {
        message,
        sideEffects: [
          { type: "data", file: "board.data.json", version: "v1", undo: { op: "set", path: "cfg", before: { a: 1 } } },
        ],
      },
    };
    expect(parseChatReplayEvent(event)).toEqual(event);
  });

  it("rejects tool/result with malformed sideEffects", () => {
    const event = {
      type: "tool/result",
      seq: 5,
      time: 1,
      data: { message, sideEffects: [{ type: "nope", file: "x" }] },
    };
    expect(() => parseChatReplayEvent(event)).toThrow(/Invalid payload/);
  });
});
