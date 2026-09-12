import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "../../lib/types";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { FloatingChatContainer } from "./FloatingChatContainer";
import { useFloatingChatStore, type FloatingChatState } from "./store";

const sendMessage = vi.fn(() => true);

vi.mock("../chat/hooks/useChatSession", () => ({
  useChatSession: () => ({ sendMessage }),
}));

vi.mock("../chat", () => ({
  Chat: () => <div data-testid="mock-chat" />,
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({}),
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

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  useFloatingChatStore.setState({ byProject: { p1: petState() } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("FloatingChatContainer pet mode", () => {
  it("renders the avatar initial and mini composer without the message list", () => {
    renderWithProviders(
      <FloatingChatContainer projectId="p1" floatingChat={petState()} agent={agent} />,
      { bridge: createMockHostBridge() },
    );

    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(document.querySelector("[data-chat-messages]")).not.toBeInTheDocument();
  });

  it("switches back to full mode from the avatar button", async () => {
    renderWithProviders(
      <FloatingChatContainer projectId="p1" floatingChat={petState()} agent={agent} />,
      { bridge: createMockHostBridge() },
    );

    await user.click(screen.getByRole("button", { name: "完整模式" }));
    expect(useFloatingChatStore.getState().byProject["p1"]?.mode).toBe("full");
  });

  it("shows the pet toggle in full mode titlebar", () => {
    renderWithProviders(
      <FloatingChatContainer
        projectId="p1"
        floatingChat={{ ...petState(), mode: "full" }}
        agent={agent}
      />,
      { bridge: createMockHostBridge() },
    );

    expect(screen.getByRole("button", { name: "桌宠模式" })).toBeInTheDocument();
  });
});
