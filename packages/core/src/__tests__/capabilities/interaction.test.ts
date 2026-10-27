import { describe, expect, it, vi } from "vitest";
import { interactionCapability } from "../../capabilities/interaction/index.js";
import type { AgentProfile } from "../../types.js";
import type { ToolHost } from "../../kernel/ports.js";

function hostWithUnlimited(unlimitedAsk: boolean | undefined, ask: ReturnType<typeof vi.fn>): ToolHost {
  return {
    agentId: "agent",
    sessionId: "session",
    profile: {
      id: "agent",
      name: "Agent",
      slug: "agent",
      systemPrompt: "",
      filePath: "agent.md",
      ...(unlimitedAsk === undefined ? {} : { unlimitedAsk }),
    } as AgentProfile,
    projectRoot: "/tmp",
    askGate: { ask },
  } as unknown as ToolHost;
}

function askUserTool(host: ToolHost) {
  const tool = interactionCapability()
    .tools(host)
    .find((t) => t.name === "ask_user");
  if (!tool) throw new Error("ask_user tool not registered");
  return tool;
}

describe("interactionCapability ask wiring", () => {
  it("passes Infinity to the ask gate for unlimited agents", async () => {
    const ask = vi.fn(async () => ({ answer: "ok", timedOut: false }));
    const tool = askUserTool(hostWithUnlimited(true, ask));
    await tool.execute("tc1", { question: "Q?" });
    expect(ask.mock.calls[0][1]).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps the default timeout for regular agents", async () => {
    const ask = vi.fn(async () => ({ answer: "ok", timedOut: false }));
    const tool = askUserTool(hostWithUnlimited(undefined, ask));
    await tool.execute("tc1", { question: "Q?" });
    expect(ask.mock.calls[0][1]).toBe(600_000);
  });
});
