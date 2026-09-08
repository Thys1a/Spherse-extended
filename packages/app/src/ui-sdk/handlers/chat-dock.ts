import { registerAction } from "../registry";
import { respond } from "../respond";
import { isFeatureEnabled } from "../../lib/feature-registry";
import { ensureProjectSession } from "../../queries/project";
import {
  useDockedChatStore,
  type DockSlotRect,
} from "../../features/docked-chat/store";

function findIframeBySource(
  source: MessageEventSource | null | undefined,
): HTMLIFrameElement | null {
  if (!source) return null;
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    if (frame.contentWindow === source) return frame;
  }
  return null;
}

// The docked panel mirrors the session's message list, so it renders the same
// HtmlCard (with its own <spherse-chat> placeholder). Docking from inside a
// panel would recurse (panel → card → panel → …); reject it at the handler.
function isInsideDockedPanel(iframe: HTMLIFrameElement): boolean {
  return !!iframe.closest("[data-docked-chat-panel]");
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSlotRect(params: Record<string, unknown>): DockSlotRect | null {
  const x = asFiniteNumber(params.x);
  const y = asFiniteNumber(params.y);
  const width = asFiniteNumber(params.width);
  const height = asFiniteNumber(params.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

registerAction("chat.dock", async (params, ctx) => {
  const { sessionId } = params as { sessionId?: unknown };
  if (typeof sessionId !== "string" || sessionId === "") {
    respond(ctx, false, { error: "invalid_params" });
    return;
  }
  if (!isFeatureEnabled("embedded-chat", ctx.hostKind)) {
    respond(ctx, false, { error: "feature_disabled" });
    return;
  }

  const iframe = findIframeBySource(ctx.source);
  if (!iframe) {
    respond(ctx, false, { error: "iframe_not_found" });
    return;
  }
  if (isInsideDockedPanel(iframe)) {
    respond(ctx, false, { error: "dock_not_allowed" });
    return;
  }

  const session = await ensureProjectSession(ctx.projectId, ctx.client, sessionId).catch(
    () => null,
  );
  if (!session) {
    respond(ctx, false, { error: "session_not_found" });
    return;
  }

  useDockedChatStore.getState().dock(ctx.source as MessageEventSource, sessionId, iframe);
  respond(ctx, true, { sessionId });
});

registerAction("chat.rect", (params, ctx) => {
  const slotRect = asSlotRect(params);
  if (!slotRect || !ctx.source) return;
  useDockedChatStore.getState().setSlotRect(ctx.source, slotRect);
});

registerAction("chat.undock", (_params, ctx) => {
  if (!ctx.source) return;
  useDockedChatStore.getState().undock(ctx.source);
});