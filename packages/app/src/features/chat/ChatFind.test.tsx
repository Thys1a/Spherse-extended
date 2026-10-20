import { act, fireEvent, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { Chat } from "./index";
import type { MessageGroup } from "./model/message-group";

const GROUPS: MessageGroup[] = [
  {
    id: "g1",
    kind: "turn",
    user: { kind: "user", id: "u1", text: "hello" },
    hasError: false,
    bubbles: [
      { kind: "assistant", id: "b1", entryId: "a1", text: "apple pie with apple", tools: [] },
    ],
  },
];

vi.mock("./hooks/useChatSession", () => ({
  useChatSession: () => ({
    entries: [],
    groups: GROUPS,
    supersededToolCallIds: new Set<string>(),
    thinking: false,
    runningGroupId: null,
    withdrawableUserId: null,
    streaming: sessionCtl.streaming,
    loading: false,
    connection: { state: "open", attempt: 0, delayMs: 0 },
    historyError: false,
    hasMore: false,
    loadingMore: false,
    compactResult: sessionCtl.compactResult,
    clearCompactResult: sessionCtl.clearCompactResult,
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

const sessionCtl = vi.hoisted(() => ({
  streaming: false,
  compactResult: null as { applied: boolean } | null,
  clearCompactResult: vi.fn(),
  refreshSessionStatus: vi.fn(),
}));

vi.mock("../../queries/project/sessions", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../queries/project/sessions")>();
  return { ...mod, refreshSessionStatus: sessionCtl.refreshSessionStatus };
});

vi.mock("./hooks/useAgentTheme", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./hooks/useAgentTheme")>();
  return { ...mod, useAgentTheme: () => "" };
});

vi.mock("../../queries/project/agents", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../queries/project/agents")>();
  return { ...mod, useAgentProfile: () => ({ profile: null, loading: false, error: null }) };
});

Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});

const agent = { id: "a1", name: "Helper", slug: "helper" };

function renderChat() {
  return renderWithProviders(<Chat sessionId="s1" agent={agent} />, {
    bridge: createMockHostBridge(),
    queryClient: createTestQueryClient(),
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function findBar(): HTMLElement | null {
  return document.querySelector("[data-find-bar]");
}

function countText(): string {
  return findBar()?.querySelector("span")?.textContent ?? "";
}

function findInput(): HTMLInputElement {
  const input = findBar()?.querySelector("input");
  if (!input) throw new Error("find input not rendered");
  return input as HTMLInputElement;
}

describe("Chat find bar", () => {
  it("opens on Ctrl+F when focus is inside chat and counts matches", async () => {
    renderChat();
    expect(findBar()).toBeNull();

    (screen.getByRole("textbox") as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(findBar()).not.toBeNull();

    const user = userEvent.setup();
    await user.type(findInput(), "apple");
    await act(async () => {
      await sleep(170);
    });
    expect(findBar()?.querySelector("span")?.textContent).toBe("1/2");
  });

  it("ignores Ctrl+F when focus is outside chat", () => {
    renderChat();
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(findBar()).toBeNull();
  });

  it("cycles matches in DOM order with Enter and Shift+Enter", async () => {
    renderChat();
    (screen.getByRole("textbox") as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const user = userEvent.setup();
    await user.type(findInput(), "apple");
    await act(async () => {
      await sleep(170);
    });
    expect(countText()).toBe("1/2");
    await user.type(findInput(), "{Enter}");
    expect(countText()).toBe("2/2");
    fireEvent.keyDown(findInput(), { key: "Enter", shiftKey: true });
    expect(countText()).toBe("1/2");
    await user.type(findInput(), "{Enter}");
    await user.type(findInput(), "{Enter}");
    expect(countText()).toBe("1/2");
  });

  it("closes on Escape in the find input", async () => {
    renderChat();
    (screen.getByRole("textbox") as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(findBar()).not.toBeNull();

    const user = userEvent.setup();
    await user.type(findInput(), "apple");
    await act(async () => {
      await sleep(170);
    });
    expect(document.querySelectorAll("mark.sp-find-mark").length).toBeGreaterThan(0);
    await user.type(findInput(), "{Escape}");
    expect(findBar()).toBeNull();
    expect(document.querySelectorAll("mark.sp-find-mark").length).toBe(0);
  });

  it("keeps the find bar mounted with a stale count when messages change mid-find", async () => {
    const { rerender } = renderChat();
    (screen.getByRole("textbox") as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const user = userEvent.setup();
    await user.type(findInput(), "apple");
    await act(async () => {
      await sleep(170);
    });
    expect(countText()).toBe("1/2");
    GROUPS[0].bubbles.push(
      { kind: "assistant", id: "b2", entryId: "a2", text: "more apple here", tools: [] },
    );
    rerender(<Chat sessionId="s1" agent={agent} />);
    expect(findBar()).not.toBeNull();
    expect(countText()).toBe("1/2");
    GROUPS[0].bubbles.pop();
  });

  it("opens from the header find button", async () => {
    renderChat();
    expect(findBar()).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /查找/ }));
    expect(findBar()).not.toBeNull();
  });

  it("opens from the corner button when the header is hidden", async () => {
    renderWithProviders(<Chat sessionId="s1" agent={agent} hideHeader />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });
    expect(findBar()).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "查找" }));
    expect(findBar()).not.toBeNull();
  });

  it("refreshes the session status query when streaming ends", async () => {
    sessionCtl.streaming = true;
    sessionCtl.refreshSessionStatus.mockClear();
    const { rerender } = renderChat();
    expect(sessionCtl.refreshSessionStatus).not.toHaveBeenCalled();

    sessionCtl.streaming = false;
    rerender(<Chat sessionId="s1" agent={agent} />);
    await vi.waitFor(() => {
      expect(sessionCtl.refreshSessionStatus).toHaveBeenCalledWith("p1", "a1", "s1");
    });
  });

  it("refreshes the session status query when compaction is applied", async () => {
    sessionCtl.compactResult = { applied: true };
    sessionCtl.refreshSessionStatus.mockClear();
    sessionCtl.clearCompactResult.mockClear();
    const { rerender } = renderChat();
    await vi.waitFor(() => {
      expect(sessionCtl.refreshSessionStatus).toHaveBeenCalledWith("p1", "a1", "s1");
    });
    expect(sessionCtl.clearCompactResult).toHaveBeenCalled();
    sessionCtl.compactResult = null;
    rerender(<Chat sessionId="s1" agent={agent} />);
  });

  it("does not refresh when compaction reports not needed", async () => {
    sessionCtl.compactResult = { applied: false };
    sessionCtl.refreshSessionStatus.mockClear();
    renderChat();
    await act(async () => {
      await sleep(50);
    });
    expect(sessionCtl.refreshSessionStatus).not.toHaveBeenCalled();
    sessionCtl.compactResult = null;
  });
});
