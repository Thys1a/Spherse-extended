import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetFloatingChat = vi.fn();
const mockNavigate = vi.fn();
const mockGetState = vi.fn(() => ({
  byProject: {} as Record<string, unknown>,
  setFloatingChat: mockSetFloatingChat,
}));

let tabsOn = true;

vi.mock("../../features/floating-chat/store", () => ({
  useFloatingChatStore: { getState: () => mockGetState() },
}));

vi.mock("../../features/floating-chat", () => ({
  getDefaultFloatingState: (sessionId: string) => ({ sessionId }) as never,
}));

vi.mock("../../lib/feature-registry", () => ({
  isFeatureEnabled: (feature: string, hostKind: string) => {
    if (feature === "tabs") return tabsOn;
    if (feature === "floating-chat") return hostKind === "electron";
    return false;
  },
}));

import { openChat } from "./open-chat";

function makeCtx(hostKind: "electron" | "web" = "electron") {
  return {
    projectId: "proj-1",
    navigate: mockNavigate,
    hostKind,
  } as never;
}

describe("openChat", () => {
  beforeEach(() => {
    tabsOn = true;
    mockSetFloatingChat.mockReset();
    mockNavigate.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({ byProject: {}, setFloatingChat: mockSetFloatingChat });
  });

  it("navigates by default when tabs are on and nothing floats", () => {
    openChat(makeCtx("electron"), "s1", undefined);

    expect(mockNavigate).toHaveBeenCalledWith("/project/proj-1/chat/s1");
    expect(mockSetFloatingChat).not.toHaveBeenCalled();
  });

  it("navigates even when the same session floats and tabs are on", () => {
    mockGetState.mockReturnValue({
      byProject: { "proj-1": { sessionId: "s1" } },
      setFloatingChat: mockSetFloatingChat,
    });

    openChat(makeCtx("electron"), "s1", undefined);

    expect(mockNavigate).toHaveBeenCalledWith("/project/proj-1/chat/s1");
  });

  it("opens floating instead of navigating on explicit float", () => {
    openChat(makeCtx("electron"), "s1", true);

    expect(mockSetFloatingChat).toHaveBeenCalledWith("proj-1", { sessionId: "s1" });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("downgrades float to navigation on web", () => {
    openChat(makeCtx("web"), "s1", true);

    expect(mockSetFloatingChat).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/project/proj-1/chat/s1");
  });

  it("skips navigation for the floating session when tabs are off", () => {
    tabsOn = false;
    mockGetState.mockReturnValue({
      byProject: { "proj-1": { sessionId: "s1" } },
      setFloatingChat: mockSetFloatingChat,
    });

    openChat(makeCtx("electron"), "s1", undefined);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates for another session when tabs are off", () => {
    tabsOn = false;
    mockGetState.mockReturnValue({
      byProject: { "proj-1": { sessionId: "other" } },
      setFloatingChat: mockSetFloatingChat,
    });

    openChat(makeCtx("electron"), "s1", undefined);

    expect(mockNavigate).toHaveBeenCalledWith("/project/proj-1/chat/s1");
  });
});
