import { call, fire } from "./messaging.js";
import { getRuntime } from "./context.js";

/**
 * Docked chat slot: scans the document for a `<spherse-chat>` (or
 * `[data-spherse-chat]`) placeholder element and reports its geometry to the
 * host so the host can overlay a real chat panel on top of the iframe.
 *
 * - One dock per document: the first placeholder wins; later calls re-bind.
 * - Rect updates are time-throttled with a leading-edge send (~100ms) and
 *   self-limited to ~10/s because `chat.rect` is rate-limit whitelisted on the
 *   host side.
 * - `pagehide` or placeholder removal sends `chat.undock`.
 */

const RECT_MIN_INTERVAL_MS = 100;

let slotElement: Element | null = null;
let boundSessionId: string | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let rectTimer: number | null = null;
let lastRectSentAt = 0;

function findSlotElement(): Element | null {
  return document.querySelector("spherse-chat, [data-spherse-chat]");
}

function coerceSessionId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function sendRect(): void {
  if (!slotElement || !boundSessionId) return;
  const box = slotElement.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return;
  fire("chat.rect", {
    sessionId: boundSessionId,
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
}

/** Leading-edge sync send; bursts collapse into a single trailing send (~100ms). */
function scheduleRect(): void {
  if (!slotElement || !boundSessionId) return;
  if (rectTimer !== null) return;
  const now = Date.now();
  const elapsed = now - lastRectSentAt;
  if (elapsed >= RECT_MIN_INTERVAL_MS) {
    sendRect();
    lastRectSentAt = now;
    return;
  }
  rectTimer = window.setTimeout(() => {
    rectTimer = null;
    if (slotElement && boundSessionId) {
      sendRect();
      lastRectSentAt = Date.now();
    }
  }, RECT_MIN_INTERVAL_MS - elapsed);
}

function startObservers(): void {
  if (!slotElement) return;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => scheduleRect());
    resizeObserver.observe(slotElement);
  }
  document.addEventListener("scroll", scheduleRect, { capture: true, passive: true });
  if (typeof MutationObserver !== "undefined") {
    mutationObserver = new MutationObserver(() => {
      if (!slotElement || !document.contains(slotElement)) {
        undock();
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function stopObservers(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  document.removeEventListener("scroll", scheduleRect, { capture: true });
  mutationObserver?.disconnect();
  mutationObserver = null;
  if (rectTimer !== null) {
    window.clearTimeout(rectTimer);
    rectTimer = null;
  }
}

export function undock(): void {
  const hadDock = boundSessionId !== null;
  stopObservers();
  slotElement = null;
  boundSessionId = null;
  if (hadDock) fire("chat.undock", {});
}

/**
 * Bind the placeholder slot and report its geometry. `params.sessionId`
 * overrides the runtime session (explicit binding, resolves immediately);
 * absent → waits for the runtime context (chat HtmlCard only) and binds
 * its session.
 */
export async function dockChat(
  params: { sessionId?: string } = {},
): Promise<void> {
  const explicit = coerceSessionId(params.sessionId);
  const sessionId = explicit ?? coerceSessionId((await getRuntime()).sessionId);
  if (!sessionId) return;

  const slot = findSlotElement();
  if (!slot) return;

  if (slot !== slotElement || sessionId !== boundSessionId) {
    lastRectSentAt = 0;
  }
  slotElement = slot;
  boundSessionId = sessionId;
  startObservers();
  await call<void>("chat.dock", { sessionId });
  scheduleRect();
}

/** Auto-dock once the runtime context arrives (chat HtmlCard only). */
export function installAutoDock(): void {
  void getRuntime().then((runtime) => {
    if (runtime.sessionId) void dockChat().catch(() => {});
  });
  window.addEventListener("pagehide", () => undock());
}
