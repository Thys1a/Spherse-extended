import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

const WRITER_PROFILE = `---
name: Writer Agent
tools:
  - mutate_data
---

Test agent that writes data.`;

const BOARD_MANIFEST = {
  version: 1,
  mutations: {
    addTodo: {
      op: "append",
      path: "todos",
      fields: { title: { type: "string", required: true } },
    },
  },
};

function assistantMessage(content: unknown[], stopReason = "stop"): any {
  return {
    role: "assistant",
    content,
    stopReason,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
    timestamp: Date.now(),
  };
}

describe("turn side effects end to end (R2.5a)", () => {
  let tmpDir: string;
  let runtime: Awaited<ReturnType<typeof createProject>>;
  let agentId: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spside-"));
    getChatStreamFnMock.mockClear();
    resolveModelByIdMock.mockClear();
    runtime = await createProject(tmpDir, {
      projectName: "Test",
      logger: createSilentLogger(),
      modelCatalog: stubCatalog,
      defaultModel: "openai/gpt-4o",
    });
    const projectStore = (runtime.projectManager as any).projectStore;
    const agent = await projectStore.createAgent("writer", WRITER_PROFILE);
    agentId = agent.getProfile().id;
    runtime.timerService.stop();
    await fs.writeFile(
      path.join(tmpDir, "board.data.json"),
      JSON.stringify({ $manifest: BOARD_MANIFEST, todos: [] }),
    );
  });

  afterEach(async () => {
    await runtime.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists a turn's writes via tool/result sideEffects", async () => {
    const toolCall = {
      type: "toolCall",
      id: "call-1",
      name: "mutate_data",
      arguments: { file: "board.data.json", name: "addTodo", args: { title: "hi" } },
    };
    const finalAssistant = assistantMessage([{ type: "text", text: "done" }]);
    let calls = 0;
    getChatStreamFnMock.mockImplementation(
      () =>
        (async () => ({
          async *[Symbol.asyncIterator]() {},
          result: async () => (++calls === 1 ? assistantMessage([toolCall]) : finalAssistant),
        })) as never,
    );
    try {
      const sessionId = await runtime.sessionRuntime.createSession(agentId);
      await runtime.sessionRuntime.sendMessage(sessionId, "write it", [], () => {});

      const doc = JSON.parse(await fs.readFile(path.join(tmpDir, "board.data.json"), "utf8"));
      expect(doc.todos).toHaveLength(1);

      const projectStore = (runtime.projectManager as any).projectStore;
      const agentStore = projectStore.getAgent(agentId);
      const events = agentStore.sessions.readEvents(sessionId);
      const toolResults = events.filter((e: { type: string }) => e.type === "tool/result");
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].data.sideEffects).toEqual([
        { type: "data", file: "board.data.json", version: expect.any(String) },
      ]);

      const turnStart = events.find((e: { type: string }) => e.type === "turn/start");
      expect(turnStart).toBeDefined();
      expect(runtime.sessionRuntime.listSideEffectsByTurn(sessionId, turnStart.seq)).toEqual(
        toolResults[0].data.sideEffects,
      );
      expect(runtime.sessionRuntime.listSideEffectsByTurn(sessionId, 999)).toEqual([]);
    } finally {
      getChatStreamFnMock.mockImplementation(() => vi.fn() as never);
    }
  });
});
