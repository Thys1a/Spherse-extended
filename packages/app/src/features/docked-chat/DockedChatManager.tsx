import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { useProjectCatalog, useProjectSession } from "../../queries/project";
import { Chat } from "../chat";
import { useDockedChatStore, type DockedChatEntry } from "./store";

/**
 * Docked chat panel overlaying an HtmlCard iframe.
 *
 * Viewport rect = iframe element rect (outer doc, recomputed on outer scroll /
 * resize via ResizeObserver + capture-phase scroll listener) + slot rect
 * (iframe document coords, reported by the SDK via `chat.rect`), clamped to the
 * iframe element's visible box so a bogus SDK rect cannot escape the card.
 */

function computeViewportRect(entry: DockedChatEntry) {
  const slot = entry.slotRect;
  if (!slot) return null;
  const iframeRect = entry.iframe.getBoundingClientRect();
  const left = Math.max(iframeRect.left, iframeRect.left + slot.x);
  const top = Math.max(iframeRect.top, iframeRect.top + slot.y);
  const right = Math.min(iframeRect.right, left + slot.width);
  const bottom = Math.min(iframeRect.bottom, top + slot.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function DockedChatItem({
  source,
  entry,
}: {
  source: MessageEventSource;
  entry: DockedChatEntry;
}) {
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const { sessions, agents } = useProjectCatalog(projectId, client);
  const sessionQuery = useProjectSession(projectId, client, entry.sessionId);
  const undock = useDockedChatStore((s) => s.undock);
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const iframe = entry.iframe;
    const bump = () => setSyncTick((v) => v + 1);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;
    observer?.observe(iframe);
    // Streaming re-renders can remount the card iframe (element removed from
    // the DOM) without a reliable pagehide from the old document; watch the
    // DOM so the liveness check below re-runs promptly.
    const domObserver = new MutationObserver(bump);
    domObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener("scroll", bump, { capture: true, passive: true });
    window.addEventListener("resize", bump);
    return () => {
      observer?.disconnect();
      domObserver.disconnect();
      document.removeEventListener("scroll", bump, { capture: true });
      window.removeEventListener("resize", bump);
    };
  }, [entry.iframe]);

  useEffect(() => {
    if (!entry.iframe.isConnected || entry.iframe.contentWindow !== source) {
      undock(source);
    }
  }, [syncTick, entry.iframe, source, undock]);

  const session = sessionQuery.data ?? sessions.find((item) => item.id === entry.sessionId);

  useEffect(() => {
    if (sessionQuery.isSuccess && !session) undock(source);
  }, [sessionQuery.isSuccess, session, source, undock]);

  if (!session) return null;
  const agent = agents.find((a) => a.id === session.agentId);
  if (!agent) return null;

  const rect = computeViewportRect(entry);
  if (!rect) return null;

  return createPortal(
    <div
      data-docked-chat-panel
      className="fixed z-30 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      <Chat
        key={entry.sessionId}
        sessionId={entry.sessionId}
        agent={agent}
        hideHeader
      />
    </div>,
    document.body,
  );
}

export function DockedChatManager() {
  const entries = useDockedChatStore((s) => s.entries);
  if (entries.size === 0) return null;
  return (
    <>
      {Array.from(entries.entries()).map(([source, entry]) => (
        <DockedChatItem key={entry.dockId} source={source} entry={entry} />
      ))}
    </>
  );
}