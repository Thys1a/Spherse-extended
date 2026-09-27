import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createSilentLogger } from "../../logger.js";

const { getChatStreamFnMock, resolveModelByIdMock } = vi.hoisted(() => ({
  getChatStreamFnMock: vi.fn(() => vi.fn()),
  resolveModelByIdMock: vi.fn((modelId: string) => {
    const slashIdx = modelId.indexOf("/");
    return slashIdx >= 0
      ? { id: modelId.slice(slashIdx + 1), provider: modelId.slice(0, slashIdx) }
      : { id: modelId, provider: modelId };
  }),
}));

const stubCatalog = {
  getChatStreamFn: getChatStreamFnMock,
  resolveModelById: resolveModelByIdMock,
} as never;

import { createProject } from "../../factory.js";
import { AgentRunner } from "../../session/agent-runner.js";
import { deriveMessages } from "../../session/fold.js";
import { RunConfigHolder, type RuntimeDeps } from "../../session/runtime.js";
import { createModelResolver } from "../../session/model-resolver.js";
import { builtinToolCapabilities } from "../../capabilities/builtin.js";
import { createStoreRegistry } from "../../kernel/ports.js";

const TEST_AGENT_PROFILE = `---
name: Test Agent
tools:
  - read_file
---

Test agent for sessions.`;

function assistantMessage(text: string, stopReason = "stop"): any {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
    timestamp: Date.now(),
  };
}

describe("AgentRunner turn events (R2.1)", () => {
  let tmpDir: string;
  let runtime: Awaited<ReturnType<typeof createProject>>;
  let deps: RuntimeDeps;
  let runConfig: RunConfigHolder;
  let agentId: string;
  let onTurnEvent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-turn-events-"));
    getChatStreamFnMock.mockClear();
    resolveModelByIdMock.mockClear();
    runtime = await createProject(tmpDir, {
      projectName: "Test",
      logger: createSilentLogger(),
    });
    const projectStore = (runtime.projectManager as any).projectStore;
    const testAgent = await projectStore.createAgent("test-agent", TEST_AGENT_PROFILE);
    agentId = testAgent.getProfile().id;
    runtime.timerService.stop();
    runConfig = new RunConfigHolder({ defaultModel: "openai/gpt-4o" });
    onTurnEvent = vi.fn();
    deps = {
      projectStore,
      projectRoot: projectStore.getRootPath(),
      fileWriteMutex: (runtime.sessionRuntime as any).deps.fileWriteMutex,
      logger: createSilentLogger(),
      runConfig,
      onTurnEvent,
      modelResolver: createModelResolver(stubCatalog),
      modelCatalog: stubCatalog,
      capabilities: builtinToolCapabilities(),
      stores: createStoreRegistry(),
      attachmentProcessors: [],
    } as RuntimeDeps;
  });

  afterEach(async () => {
    await runtime.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sendMessage emits user/assistant/turn-end exactly once with payloads", async () => {
    const finalAssistant = assistantMessage("ok");
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => finalAssistant,
        })) as never,
    );
    try {
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const runner = await AgentRunner.init(deps, agentId, sessionId);

      await runner.sendMessage("hello", [], () => {});

      expect(onTurnEvent).toHaveBeenCalledTimes(3);
      const [userEvt, assistantEvt, endEvt] = onTurnEvent.mock.calls.map((c) => c[0]);
      expect(userEvt.name).toBe("sp:user-message");
      expect(assistantEvt.name).toBe("sp:assistant-message");
      expect(endEvt.name).toBe("sp:turn-end");
      for (const evt of [userEvt, assistantEvt, endEvt]) {
        expect(evt.payload.sessionId).toBe(sessionId);
        expect(evt.payload.agentId).toBe(agentId);
      }
      expect(userEvt.payload.seq).toBeLessThan(assistantEvt.payload.seq);
      expect(assistantEvt.payload.seq).toBeLessThan(endEvt.payload.seq);
      expect(endEvt.payload.reason).toBe("completed");
      expect(userEvt.payload.reason).toBeUndefined();
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });

  it("prompt throw emits a synthetic error turn-end exactly once", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    (runner as any).agentRef.prompt = () => Promise.reject(new Error("model exploded"));

    await expect(runner.sendMessage("hello", [], () => {})).rejects.toThrow("model exploded");

    const names = onTurnEvent.mock.calls.map((c) => c[0].name);
    expect(names).toEqual(["sp:user-message", "sp:turn-end"]);
    const [userEvt, endEvt] = onTurnEvent.mock.calls.map((c) => c[0]);
    expect(endEvt.payload.reason).toBe("error");
    expect(endEvt.payload.seq).toBeGreaterThan(userEvt.payload.seq);
  });

  it("no synthetic turn-end when the normal error turn-end already fired", async () => {
    const finalAssistant = assistantMessage("ok");
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => finalAssistant,
        })) as never,
    );
    try {
      const hookDeps = {
        ...deps,
        createTurnHooks: () => ({
          afterTurn: async () => {
            throw new Error("hook blew");
          },
        }),
      };
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const runner = await AgentRunner.init(hookDeps as never, agentId, sessionId);

      await expect(runner.sendMessage("hello", [], () => {})).rejects.toThrow("hook blew");

      const names = onTurnEvent.mock.calls.map((c) => c[0].name);
      expect(names).toEqual(["sp:user-message", "sp:assistant-message", "sp:turn-end"]);
      expect(onTurnEvent.mock.calls[2][0].payload.reason).toBe("completed");
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });
  it("trigger-sourced turns carry depth/chainId into turn events (R2.4)", async () => {
    const finalAssistant = assistantMessage("ok");
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => finalAssistant,
        })) as never,
    );
    try {
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const runner = await AgentRunner.init(deps, agentId, sessionId);

      await runner.sendMessage("hello", [], () => {}, {
        source: "triggered",
        triggerName: "daily",
        triggerDepth: 4,
        triggerChainId: "chain-9",
      });

      const payloads = onTurnEvent.mock.calls.map((c) => c[0].payload);
      expect(payloads).toHaveLength(3);
      for (const payload of payloads) {
        expect(payload.depth).toBe(4);
        expect(payload.chainId).toBe("chain-9");
      }
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });

  it("toolResult rounds do not emit sp:assistant-message", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);

    (runner as any).appendMessageEvent({ role: "toolResult", toolCallId: "t1", content: "out" });
    expect(onTurnEvent).not.toHaveBeenCalled();

    (runner as any).appendMessageEvent(assistantMessage("done"));
    expect(onTurnEvent).toHaveBeenCalledTimes(1);
    expect(onTurnEvent.mock.calls[0][0].name).toBe("sp:assistant-message");
  });

  it("truncated length turn persists as error with promptEstimate and stays retryable", async () => {
    const truncated = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "That" }],
      stopReason: "length",
      usage: { input: 100, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 101 },
      timestamp: Date.now(),
    };
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => truncated,
        })) as never,
    );
    try {
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const runner = await AgentRunner.init(deps, agentId, sessionId);

      await runner.sendMessage("hello", [], () => {});

      const events = (runner as any).eventLog.events;
      const persisted = events.find((e: any) => e.type === "assistant/message");
      expect(persisted.data.message.stopReason).toBe("error");
      expect(persisted.data.message.rawStopReason).toBe("length");
      expect(typeof persisted.data.message.errorMessage).toBe("string");
      expect(typeof persisted.data.message.promptEstimate).toBe("number");
      expect(events.find((e: any) => e.type === "turn/end").data.reason).toBe("error");

      const agent = runner.agentRef as any;
      agent.continue = vi.fn().mockResolvedValue(undefined);
      await runner.retryLastTurn(() => {});
      expect(agent.continue).toHaveBeenCalledTimes(1);
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });

  it("length turn with text is not marked as failure", async () => {
    const partial = assistantMessage("half-written", "length");
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => partial,
        })) as never,
    );
    try {
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const runner = await AgentRunner.init(deps, agentId, sessionId);

      await runner.sendMessage("hello", [], () => {});

      const events = (runner as any).eventLog.events;
      expect(events.find((e: any) => e.type === "assistant/message").data.message.stopReason).toBe(
        "length",
      );
      expect(events.find((e: any) => e.type === "turn/end").data.reason).toBe("completed");
      await expect(runner.retryLastTurn(() => {})).rejects.toThrow(/no failed assistant turn/);
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });

  it("blocks the third consecutive identical tool call", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const agent = runner.agentRef as any;
    const call = (id: string, args: unknown) => ({
      toolCall: { id, name: "read_file", arguments: args },
      args,
    });

    expect(await agent.beforeToolCall(call("t1", { path: "a.md" }))).toBeUndefined();
    expect(await agent.beforeToolCall(call("t2", { path: "a.md" }))).toBeUndefined();
    const blocked = await agent.beforeToolCall(call("t3", { path: "a.md" }));
    expect(blocked).toMatchObject({ block: true, terminate: true });
    expect(blocked.reason).toContain("loop guard");
  });

  it("resets the repeat streak on different arguments", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const agent = runner.agentRef as any;
    const call = (id: string, args: unknown) => ({
      toolCall: { id, name: "read_file", arguments: args },
      args,
    });

    expect(await agent.beforeToolCall(call("t1", { path: "a.md" }))).toBeUndefined();
    expect(await agent.beforeToolCall(call("t2", { path: "a.md" }))).toBeUndefined();
    expect(await agent.beforeToolCall(call("t3", { path: "b.md" }))).toBeUndefined();
    expect(await agent.beforeToolCall(call("t4", { path: "b.md" }))).toBeUndefined();
  });

  it("stops the turn after exceeding the per-turn tool call budget", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const stop = (runner.agentRef as any).shouldStopAfterTurn;
    const message = { stopReason: "stop" };

    expect(await stop({ message, toolResults: [] })).toBe(false);
    const results = Array.from({ length: 31 }, (_, i) => ({ toolCallId: `t${i}` }));
    expect(await stop({ message, toolResults: results })).toBe(true);
  });

  it("stops the turn after consecutive truncated turns and resets on progress", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const stop = (runner.agentRef as any).shouldStopAfterTurn;
    const truncated = { stopReason: "length" };
    const normal = { stopReason: "stop" };

    expect(await stop({ message: truncated, toolResults: [] })).toBe(false);
    expect(await stop({ message: normal, toolResults: [] })).toBe(false);
    expect(await stop({ message: truncated, toolResults: [] })).toBe(false);
    expect(await stop({ message: truncated, toolResults: [] })).toBe(false);
    expect(await stop({ message: truncated, toolResults: [] })).toBe(true);
  });

  it("exposes the current trigger chain", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    expect(runner.getTriggerChain()).toEqual({ depth: 0, chainId: expect.any(String) });
  });

  it("withdrawLastTurn skips withdrawn turns and withdraws the previous user message", async () => {
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const log = (runner as any).eventLog;
    const first = log.append("user/message", {
      message: { role: "user", content: "one", timestamp: 1 },
    });
    log.append("assistant/message", {
      message: { role: "assistant", content: [], stopReason: "stop", timestamp: 2 },
    });
    const second = log.append("user/message", {
      message: { role: "user", content: "two", timestamp: 3 },
    });
    log.append("assistant/message", {
      message: { role: "assistant", content: [], stopReason: "stop", timestamp: 4 },
    });

    await expect(runner.withdrawLastTurn()).resolves.toBe(second.seq);
    await expect(runner.withdrawLastTurn()).resolves.toBe(first.seq);
    await expect(runner.withdrawLastTurn()).rejects.toThrow(/no user message to withdraw/);

    expect(deriveMessages(agentStore.sessions.readEvents(sessionId))).toEqual([]);
    expect((runner.agentRef as any).state.messages).toEqual([]);
  });

  it("retry never emits sp:user-message (the retried turn still reports its own messages)", async () => {
    runConfig.update({ defaultModel: "provider/model" });
    const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
    const sessionId = agentStore.sessions.createSession();
    const runner = await AgentRunner.init(deps, agentId, sessionId);
    const agent = runner.agentRef as any;

    const userMsg = { role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 };
    const failedMsg = { ...assistantMessage("", "error"), errorMessage: "boom" };
    const log = (runner as any).eventLog;
    log.append("user/message", { message: userMsg });
    log.append("assistant/message", { message: failedMsg });
    agent.state.messages = [userMsg, failedMsg];

    const dispatches: Array<(event: unknown) => void> = [];
    agent.subscribe = ((cb: (event: unknown) => void) => {
      dispatches.push(cb);
      return () => {};
    }) as never;
    const retried = assistantMessage("recovered");
    agent.continue = vi.fn().mockImplementation(async () => {
      for (const dispatch of dispatches) {
        await dispatch({ type: "message_end", message: retried });
        await dispatch({ type: "agent_end", messages: [retried] });
      }
    });

    await runner.retryLastTurn(() => {});

    const calls = onTurnEvent.mock.calls.map((c) => c[0]);
    const names = calls.map((c) => c.name);
    expect(names).not.toContain("sp:user-message");
    expect(names).toContain("sp:turn-end");
    expect(calls.find((c) => c.name === "sp:turn-end")!.payload.reason).toBe("completed");
  });

  it("a throwing onTurnEvent never breaks the turn", async () => {
    const finalAssistant = assistantMessage("ok");
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => finalAssistant,
        })) as never,
    );
    try {
      const agentStore = (runtime.projectManager as any).projectStore.getAgent(agentId);
      const sessionId = agentStore.sessions.createSession();
      const noisy = { ...deps, onTurnEvent: () => { throw new Error("listener down"); } };
      const runner = await AgentRunner.init(noisy, agentId, sessionId);

      await expect(runner.sendMessage("hello", [], () => {})).resolves.toBeUndefined();
      const userEvents = (runner as any).eventLog.events.filter(
        (e: { type: string }) => e.type === "user/message",
      );
      expect(userEvents).toHaveLength(1);
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });
});
