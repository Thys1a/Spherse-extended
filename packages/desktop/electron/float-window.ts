import { BrowserWindow, screen } from "electron";
import type { WebContents } from "electron";
import {
  getFloatWindows,
  setFloatWindows,
  type FloatWindowBounds,
  type FloatWindowKind,
  type FloatWindowRecord,
} from "./settings.js";
import { isQuitting } from "./lifecycle.js";
import { getMainWindow, resolvePreloadPath, resolveRendererLoad } from "./window.js";
import { setupContextMenu } from "./ipc/context-menu.js";

export const FLOAT_RESTORE_LIMIT = 3;
export const FLOAT_DEFAULT_BOUNDS: FloatWindowBounds = { x: 80, y: 80, width: 420, height: 600 };
export const FLOAT_WINDOW_CLOSED_CHANNEL = "float-window:closed";
export const FLOAT_WINDOW_NAVIGATE_CHANNEL = "float-window:navigate-main";

const BOUNDS_PERSIST_DEBOUNCE_MS = 300;

export interface FloatWindowOpenOptions {
  kind: FloatWindowKind;
  projectId: string;
  itemKey: string;
  bounds?: Partial<FloatWindowBounds>;
}

export interface FloatWindowCloseOptions {
  forget?: boolean;
  dock?: boolean;
  crashed?: boolean;
  silent?: boolean;
  preserve?: boolean;
}

export type FloatWindowClosedReason = "dock" | "closed" | "crashed";

export interface FloatWindowClosedPayload {
  key: string;
  kind: FloatWindowKind;
  projectId: string;
  itemKey: string;
  bounds: FloatWindowBounds;
  reason: FloatWindowClosedReason;
}

const floatWindows = new Map<string, BrowserWindow>();
const pendingClose = new Map<string, FloatWindowCloseOptions>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function floatWindowKey(kind: FloatWindowKind, projectId: string, itemKey: string): string {
  return `${kind}:${projectId}:${itemKey}`;
}

export function floatWindowHash(kind: FloatWindowKind, projectId: string, itemKey: string): string {
  if (kind === "chat") return `/float/chat/${projectId}/${itemKey}`;
  return `/float/content/${projectId}?path=${encodeURIComponent(itemKey)}`;
}

function clampToDisplay(bounds: FloatWindowBounds): FloatWindowBounds {
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(Math.max(bounds.width, 200), area.width);
  const height = Math.min(Math.max(bounds.height, 200), area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

function joinUrlHash(base: string, hash: string): string {
  return `${base.replace(/\/+$/, "")}/#${hash}`;
}

function isAllowedFloatUrl(url: string): boolean {
  const load = resolveRendererLoad();
  if (load.type === "file") return url.startsWith("file://");
  try {
    return new URL(url).origin === new URL(load.url).origin;
  } catch {
    return false;
  }
}

function persistBoundsNow(key: string): void {
  const win = floatWindows.get(key);
  if (!win || win.isDestroyed()) return;
  let bounds: FloatWindowBounds;
  try {
    bounds = win.getBounds();
  } catch {
    return;
  }
  const records = getFloatWindows();
  const rec = records[key];
  if (rec) setFloatWindows({ ...records, [key]: { ...rec, bounds } });
}

function scheduleBoundsPersist(key: string): void {
  const existing = persistTimers.get(key);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    key,
    setTimeout(() => {
      persistTimers.delete(key);
      persistBoundsNow(key);
    }, BOUNDS_PERSIST_DEBOUNCE_MS),
  );
}

function notifyMainClosed(payload: FloatWindowClosedPayload): void {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) return;
  try {
    main.webContents.send(FLOAT_WINDOW_CLOSED_CHANNEL, payload);
  } catch {
    // main window gone — nothing to notify
  }
}

function onFloatWindowClosed(key: string): void {
  floatWindows.delete(key);
  const timer = persistTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    persistTimers.delete(key);
  }
  const opts = pendingClose.get(key) ?? {};
  pendingClose.delete(key);
  const records = getFloatWindows();
  const rec = records[key];
  if (opts.forget) {
    if (rec) {
      const next = { ...records };
      delete next[key];
      setFloatWindows(next);
    }
  } else if (!isQuitting() && !opts.preserve && rec) {
    setFloatWindows({ ...records, [key]: { ...rec, open: false } });
  }
  if (isQuitting() || opts.silent || !rec) return;
  const reason: FloatWindowClosedReason = opts.crashed ? "crashed" : opts.dock ? "dock" : "closed";
  notifyMainClosed({
    key,
    kind: rec.kind,
    projectId: rec.projectId,
    itemKey: rec.itemKey,
    bounds: rec.bounds,
    reason,
  });
}

export function openFloatWindow(options: FloatWindowOpenOptions): BrowserWindow | null {
  const { kind, projectId, itemKey } = options;
  const key = floatWindowKey(kind, projectId, itemKey);
  const existing = floatWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }
  floatWindows.delete(key);
  const records = getFloatWindows();
  const saved = records[key];
  const bounds = clampToDisplay({ ...FLOAT_DEFAULT_BOUNDS, ...saved?.bounds, ...options.bounds });
  let win: BrowserWindow;
  try {
    win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  } catch (err) {
    console.error("[float-window] failed to create window:", err);
    return null;
  }
  floatWindows.set(key, win);
  setFloatWindows({
    ...getFloatWindows(),
    [key]: { kind, projectId, itemKey, bounds, open: true },
  });
  win.setAlwaysOnTop(true);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedFloatUrl(url)) event.preventDefault();
  });
  setupContextMenu(win);
  const load = resolveRendererLoad();
  const hash = floatWindowHash(kind, projectId, itemKey);
  try {
    if (load.type === "url") void win.loadURL(joinUrlHash(load.url, hash));
    else void win.loadFile(load.file, { hash });
  } catch (err) {
    console.error("[float-window] failed to load renderer:", err);
  }
  win.on("move", () => scheduleBoundsPersist(key));
  win.on("resize", () => scheduleBoundsPersist(key));
  win.on("close", () => persistBoundsNow(key));
  win.on("closed", () => onFloatWindowClosed(key));
  return win;
}

export function closeFloatWindowByKey(key: string, opts: FloatWindowCloseOptions = {}): boolean {
  const win = floatWindows.get(key);
  if (!win || win.isDestroyed()) {
    floatWindows.delete(key);
    return false;
  }
  pendingClose.set(key, opts);
  try {
    win.close();
  } catch (err) {
    console.error("[float-window] failed to close window:", err);
    pendingClose.delete(key);
    return false;
  }
  return true;
}

export function closeFloatWindowByWebContents(
  wc: WebContents,
  opts: FloatWindowCloseOptions = {},
): boolean {
  for (const [key, win] of floatWindows) {
    if (!win.isDestroyed() && win.webContents === wc) {
      return closeFloatWindowByKey(key, opts);
    }
  }
  return false;
}

export function handleFloatRendererGone(wc: WebContents, reason: string): void {
  if (reason === "clean-exit" || isQuitting()) return;
  for (const [key, win] of floatWindows) {
    if (win.isDestroyed() || win.webContents !== wc) continue;
    pendingClose.set(key, { crashed: true });
    try {
      win.destroy();
    } catch (err) {
      console.error("[float-window] failed to destroy crashed window:", err);
    }
  }
}

export function closeFloatsForProject(projectId: string): void {
  for (const key of [...floatWindows.keys()]) {
    const rec = getFloatWindows()[key];
    if (rec?.projectId !== projectId) continue;
    pendingClose.set(key, { forget: true, silent: true });
    const win = floatWindows.get(key);
    try {
      if (win && !win.isDestroyed()) win.close();
    } catch {
      floatWindows.delete(key);
    }
  }
  const records = getFloatWindows();
  const next: Record<string, FloatWindowRecord> = {};
  for (const [key, rec] of Object.entries(records)) {
    if (rec.projectId !== projectId) next[key] = rec;
  }
  setFloatWindows(next);
}

export function closeAllFloats(): void {
  for (const [key, win] of [...floatWindows]) {
    pendingClose.set(key, { preserve: true, silent: true });
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      floatWindows.delete(key);
    }
  }
}

export function restoreFloatWindows(registeredIds: string[]): void {
  const registered = new Set(registeredIds);
  const records = getFloatWindows();
  const next: Record<string, FloatWindowRecord> = {};
  for (const [key, rec] of Object.entries(records)) {
    if (rec.open && !registered.has(rec.projectId)) continue;
    next[key] = rec;
  }
  setFloatWindows(next);
  let opened = 0;
  for (const [key, rec] of Object.entries(next)) {
    if (opened >= FLOAT_RESTORE_LIMIT) break;
    if (!rec.open || !registered.has(rec.projectId)) continue;
    const existing = floatWindows.get(key);
    if (existing && !existing.isDestroyed()) continue;
    const win = openFloatWindow({ kind: rec.kind, projectId: rec.projectId, itemKey: rec.itemKey });
    if (win) opened += 1;
  }
}

export function listFloatKeys(): string[] {
  const keys: string[] = [];
  for (const [key, win] of floatWindows) {
    if (!win.isDestroyed()) keys.push(key);
  }
  return keys;
}
