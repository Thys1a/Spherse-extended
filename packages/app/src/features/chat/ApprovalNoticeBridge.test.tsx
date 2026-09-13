import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApprovalNoticeBridge } from "./ApprovalNoticeBridge";
import { useStreamingStore } from "./runtime/streaming-store";
import { useSettingsStore } from "../../stores/settings-store";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import type { ChatMessage } from "./types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function seedApprovalSession() {
  useStreamingStore.setState({
    sessions: {
      s2: {
        messages: [
          {
            role: "assistant",
            content: "",
            timestamp: 1,
            _toolCalls: [
              {
                toolCallId: "tc1",
                toolName: "run_command",
                _card: { type: "command", requestId: "r1", command: "ls" },
              },
            ],
          } as ChatMessage,
        ],
        streaming: false,
        lastActivityAt: Date.now(),
        scrollPosition: 0,
        attachedCount: 0,
        initialMessageSent: false,
        projectId: "p1",
        hasMore: false,
        oldestLoadedId: null,
        loadingMore: false,
        historyStatus: "ready",
        connectionStatus: "open",
        historyError: false,
        reconnectFailed: false,
        pendingWithdraw: false,
        pendingEditResend: null,
      },
    },
  });
}

describe("ApprovalNoticeBridge OS notification", () => {
  let notify: (title: string, body: string, opts?: { route?: string }) => void;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    useStreamingStore.setState({ sessions: {} });
    useSettingsStore.setState({ notifications: {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const id of Object.keys(useStreamingStore.getState().sessions)) {
      useStreamingStore.getState().disconnect(id);
    }
  });

  function renderBridge(route = "/project/p1/chat/active-session") {
    const bridge = createMockHostBridge({ notify });
    renderWithProviders(<ApprovalNoticeBridge />, {
      bridge,
      route,
    });
    return bridge;
  }

  it("toasts even when viewing the approval session", () => {
    seedApprovalSession();
    renderBridge("/project/p1/chat/s2");
    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1);
  });

  it("sends an OS notification for other-session approvals when blurred", () => {
    seedApprovalSession();
    renderBridge();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      route: "/project/p1/chat/s2",
    });
  });

  it("skips the OS notification when the window is focused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    seedApprovalSession();
    renderBridge();
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips the OS notification when approval notifications are off", () => {
    useSettingsStore.setState({ notifications: { approval: false } });
    seedApprovalSession();
    renderBridge();
    expect(notify).not.toHaveBeenCalled();
  });
});
