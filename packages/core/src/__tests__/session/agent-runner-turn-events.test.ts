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
