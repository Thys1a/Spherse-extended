import { describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { Chat } from "./index";
import type { AgentSummary } from "../../lib/types";

vi.mock("./hooks/useChatSession", () => ({
  useChatSession: () => ({
    entries: [],
    groups: [],
    supersededToolCallIds: new Set<string>(),
    thinking: false,
    runningGroupId: null,
    withdrawableUserId: null,
    streaming: false,
    loading: false,
    connection: { state: "open", attempt: 0, delayMs: 0 },
    historyError: false,
    hasMore: false,
    loadingMore: false,
    sendMessage: vi.fn(() => true),
    retry: vi.fn(),
    withdrawLastTurn: vi.fn(),
    abort: vi.fn(),
    reconnect: vi.fn(),
    retryHistory: vi.fn(),
    respondApproval: vi.fn(() => true),
    respondQuestion: vi.fn(() => true),
    loadMore: vi.fn(),
  }),
}));

vi.mock("../../queries/project/agents", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../queries/project/agents")>();
  return { ...mod, useAgentProfile: () => ({ profile: null, loading: false, error: null }) };
});

let themeCss = "";

vi.mock("./hooks/useAgentTheme", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./hooks/useAgentTheme")>();
  return { ...mod, useAgentTheme: () => themeCss };
});

const agent = { id: "a1", name: "Helper", slug: "helper" } as unknown as AgentSummary;

function renderChat() {
  return renderWithProviders(<Chat sessionId="s1" agent={agent} />, {
    bridge: createMockHostBridge(),
    queryClient: createTestQueryClient(),
  });
}

describe("Chat agent theme injection", () => {
  it("injects scoped css in an inline style tag, not a link", () => {
    themeCss = "[data-chat-root] { --x: 1; }";
    renderChat();

    const root = document.querySelector("[data-chat-root]");
    expect(root?.getAttribute("data-chat-instance")).toBe("s1");
    const style = document.querySelector('style[data-agent-theme="s1"]');
    expect(style?.textContent).toContain('[data-chat-root][data-chat-instance="s1"]');
    expect(document.querySelector('[data-chat-root] link[rel="stylesheet"]')).toBeNull();
  });

  it("renders no style tag without theme css", () => {
    themeCss = "";
    renderChat();
    expect(document.querySelector("style[data-agent-theme]")).toBeNull();
  });
});
