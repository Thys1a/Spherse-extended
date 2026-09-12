import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "../../lib/types";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { FloatingChatContainer } from "./FloatingChatContainer";
import { useFloatingChatStore, type FloatingChatState } from "./store";
import { useStreamingStore } from "../chat/runtime/streaming-store";

const OPEN = 1;

class MockWebSocket {
  static OPEN = OPEN;
  url: string;
  readyState = OPEN;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    getSessionMessagesPage: vi.fn().mockResolvedValue({ entries: [], hasMore: false, oldestId: null }),
    getSupportedProviders: vi.fn(async () => ({})),
    summonToAgent: vi.fn(),
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

const agent = { id: "a1", name: "Helper", alias: "", slug: "helper" } as unknown as AgentSummary;

function petState(): FloatingChatState {
  return {
    sessionId: "s1",
    position: { x: 10, y: 10 },
    size: { width: 216, height: 288 },
    mode: "pet",
  };
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("requestAnimationFrame", (_cb: FrameRequestCallback) => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  useFloatingChatStore.setState({ byProject: { p1: petState() } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const id of Object.keys(useStreamingStore.getState().sessions)) {
    useStreamingStore.getState().disconnect(id);
  }
});

describe("pet mode session attachment", () => {
  it("attaches on mount and detaches on unmount without leaking count", () => {
    const view = renderWithProviders(
      <FloatingChatContainer projectId="p1" floatingChat={petState()} agent={agent} />,
      { bridge: createMockHostBridge() },
    );

    expect(useStreamingStore.getState().sessions["s1"]?.attachedCount).toBe(1);

    view.unmount();
    expect(useStreamingStore.getState().sessions["s1"]?.attachedCount).toBe(0);
  });
});
