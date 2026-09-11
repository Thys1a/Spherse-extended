import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { isNearBottom, useChatScroll } from "./useChatScroll";
import { useStreamingStore } from "../runtime/streaming-store";
import type { ChatMessage } from "../types";

describe("isNearBottom (column-reverse: scrollTop 0 = bottom, negative = scrolled up)", () => {
  it("treats scrollTop 0 as pinned to the bottom", () => {
    expect(isNearBottom(0)).toBe(true);
  });

  it("returns true within the default 100px threshold (scrollTop between -100 and 0)", () => {
    expect(isNearBottom(-50)).toBe(true);
    expect(isNearBottom(-100)).toBe(true);
  });

  it("returns false once scrolled up past the threshold (scrollTop < -100)", () => {
    expect(isNearBottom(-101)).toBe(false);
    expect(isNearBottom(-800)).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(isNearBottom(-40, 40)).toBe(true);
    expect(isNearBottom(-41, 40)).toBe(false);
  });
});

function userMessage(content: string): ChatMessage {
  return { role: "user", content, timestamp: 1 };
}

function mockLayout(el: HTMLElement, scrollHeight: number, clientHeight = 200) {
  let top = 0;
  try {
    top = el.scrollTop;
  } catch {
    top = 0;
  }
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = v;
    },
    configurable: true,
  });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
}

function Harness({
  messages,
  loadingMore,
  sessionId,
}: {
  messages: ChatMessage[];
  loadingMore: boolean;
  sessionId: string;
}) {
  const { containerRef } = useChatScroll(messages, sessionId, loadingMore);
  return <div ref={containerRef} data-testid="scroll-container" />;
}

function seedSession(sessionId: string, scrollPosition: number) {
  useStreamingStore.setState({
    sessions: {
      [sessionId]: {
        messages: [],
        streaming: false,
        lastActivityAt: Date.now(),
        scrollPosition,
        attachedCount: 1,
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
      },
    },
  });
}

describe("useChatScroll load-more anchoring (column-reverse)", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn(function (
      this: HTMLElement,
      opts?: ScrollToOptions,
    ) {
      if (typeof opts === "object" && opts !== null && opts.top !== undefined) {
        this.scrollTop = opts.top;
      }
    }) as unknown as typeof window.HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    for (const id of Object.keys(useStreamingStore.getState().sessions)) {
      useStreamingStore.getState().disconnect(id);
    }
    vi.restoreAllMocks();
  });

  it("restores the reading position by scrollHeight delta instead of the raw scrollTop", () => {
    seedSession("s1", 0);
    const { rerender } = render(
      <Harness messages={[userMessage("new")]} loadingMore={false} sessionId="s1" />,
    );
    const container = screen.getByTestId("scroll-container");
    mockLayout(container, 500);
    container.scrollTop = -200;

    rerender(<Harness messages={[userMessage("new")]} loadingMore sessionId="s1" />);
    mockLayout(container, 900);
    rerender(
      <Harness messages={[userMessage("old"), userMessage("new")]} loadingMore={false} sessionId="s1" />,
    );

    expect(container.scrollTop).toBe(-600);
  });

  it("saves scrollPosition 0 on unmount when pinned to the bottom", () => {
    seedSession("s2", 0);
    const spy = vi.spyOn(useStreamingStore.getState(), "setScrollPosition");
    const { unmount } = render(
      <Harness messages={[userMessage("hi")]} loadingMore={false} sessionId="s2" />,
    );
    unmount();
    expect(spy).toHaveBeenCalledWith("s2", 0);
  });

  it("snaps to the bottom on remount when the saved position was near the bottom", () => {
    seedSession("s3", -50);
    render(<Harness messages={[userMessage("hi")]} loadingMore={false} sessionId="s3" />);
    const container = screen.getByTestId("scroll-container");
    mockLayout(container, 500);
    expect(container.scrollTop).toBe(0);
  });
});
