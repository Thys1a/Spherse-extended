import { act, fireEvent, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { Chat } from "./index";
import type { ChatMessage } from "./types";

const MESSAGES: ChatMessage[] = [
  { role: "user", content: "hello", _messageId: 1 },
  { role: "assistant", content: "apple pie with apple", _messageId: 2 },
];

vi.mock("./hooks/useChatSession", () => ({
  useChatSession: () => ({
    messages: MESSAGES,
    streaming: false,
    loading: false,
    connectionStatus: "open",
    historyError: false,
    reconnectFailed: false,
    sendMessage: vi.fn(() => true),
    retry: vi.fn(),
    withdrawLastTurn: vi.fn(),
    abort: vi.fn(),
    reconnect: vi.fn(),
    retryHistory: vi.fn(),
    respondApproval: vi.fn(() => true),
    respondQuestion: vi.fn(() => true),
  }),
}));

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
    MESSAGES.push({ role: "assistant", content: "more apple here", _messageId: 3 });
    rerender(<Chat sessionId="s1" agent={agent} />);
    expect(findBar()).not.toBeNull();
    expect(countText()).toBe("1/2");
    MESSAGES.pop();
  });
});
