import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { useStreamingStore } from "../runtime/streaming-store";

const NEAR_BOTTOM_THRESHOLD = 100;

export function isNearBottom(scrollTop: number, threshold: number = NEAR_BOTTOM_THRESHOLD): boolean {
  return scrollTop >= -threshold;
}

export function useChatScroll(messages: ChatMessage[], sessionId: string, loadingMore: boolean = false) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const restoredScrollRef = useRef(false);
  const prevCountRef = useRef(0);
  const scrollTopRef = useRef(0);
  const pendingLoadingMoreRef = useRef(false);
  const preLoadMoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

  const syncBottomState = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    scrollTopRef.current = container.scrollTop;
    const nearBottom = isNearBottom(container.scrollTop);
    isAtBottomRef.current = nearBottom;
    setIsAtBottom((prev) => (prev === nearBottom ? prev : nearBottom));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior });
    scrollTopRef.current = 0;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("scroll", syncBottomState, { passive: true });
    syncBottomState();
    return () => container.removeEventListener("scroll", syncBottomState);
  }, [syncBottomState, hasMessages]);

  const prevSessionIdRef = useRef(sessionId);

  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    restoredScrollRef.current = false;
    prevCountRef.current = 0;
    pendingLoadingMoreRef.current = false;
    preLoadMoreRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (loadingMore) {
      pendingLoadingMoreRef.current = true;
      const container = containerRef.current;
      preLoadMoreRef.current = container
        ? { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight }
        : null;
    } else {
      pendingLoadingMoreRef.current = false;
      preLoadMoreRef.current = null;
    }
  }, [loadingMore]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    if (!restoredScrollRef.current) {
      restoredScrollRef.current = true;
      const saved = useStreamingStore.getState().sessions[sessionId]?.scrollPosition;
      const maxUp = -(container.scrollHeight - container.clientHeight);
      if (saved !== undefined && saved < -NEAR_BOTTOM_THRESHOLD && saved >= maxUp) {
        container.scrollTop = saved;
        syncBottomState();
      } else {
        scrollToBottom("instant");
      }
      prevCountRef.current = messages.length;
      return;
    }

    if (pendingLoadingMoreRef.current) {
      pendingLoadingMoreRef.current = false;
      prevCountRef.current = messages.length;
      const captured = preLoadMoreRef.current;
      preLoadMoreRef.current = null;
      if (captured) {
        const grown = container.scrollHeight - captured.scrollHeight;
        container.scrollTop = captured.scrollTop - grown;
        scrollTopRef.current = container.scrollTop;
        syncBottomState();
      }
      return;
    }

    const prevCount = prevCountRef.current;
    prevCountRef.current = messages.length;
    const lastMsg = messages[messages.length - 1];

    if (messages.length > prevCount && lastMsg?.role === "user") {
      scrollToBottom("smooth");
      return;
    }
  }, [messages, sessionId, scrollToBottom, syncBottomState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return () => {
      const position = isAtBottomRef.current ? 0 : scrollTopRef.current;
      useStreamingStore.getState().setScrollPosition(sessionId, position);
    };
  }, [sessionId]);

  return { containerRef, isAtBottom, scrollToBottom };
}
