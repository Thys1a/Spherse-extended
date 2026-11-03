import { ipcMain } from "electron";
import path from "node:path";
import { isPathInside } from "@spherse/core";
import { getOpenProjects, type FloatWindowKind } from "../settings.js";
import {
  closeFloatWindowByWebContents,
  listFloatKeys,
  openFloatWindow,
  FLOAT_WINDOW_NAVIGATE_CHANNEL,
} from "../float-window.js";
import { getMainWindow } from "../window.js";

const FLOAT_KINDS: ReadonlySet<string> = new Set(["chat", "content"]);

export interface FloatWindowOpenArgs {
  kind: FloatWindowKind;
  projectId: string;
  itemKey: string;
}

function resolveProjectPath(projectId: string): string | null {
  const entry = getOpenProjects().find((p) => p.id === projectId);
  return entry ? entry.path : null;
}

function focusMainWindow(): boolean {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) return false;
  try {
    if (main.isMinimized()) main.restore();
    if (!main.isVisible()) main.show();
    main.focus();
  } catch {
    return false;
  }
  return true;
}

export function registerFloatWindowIpc(): void {
  ipcMain.handle("float-window:open", (_event, args: FloatWindowOpenArgs) => {
    if (!args || !FLOAT_KINDS.has(args.kind)) return null;
    if (typeof args.projectId !== "string" || typeof args.itemKey !== "string" || !args.itemKey) {
      return null;
    }
    const projectPath = resolveProjectPath(args.projectId);
    if (!projectPath) return null;
    if (args.kind === "content") {
      const absolute = path.isAbsolute(args.itemKey)
        ? args.itemKey
        : path.join(projectPath, args.itemKey);
      if (!isPathInside(projectPath, absolute)) return null;
    }
    const win = openFloatWindow({ kind: args.kind, projectId: args.projectId, itemKey: args.itemKey });
    return win ? { ok: true as const } : null;
  });

  ipcMain.handle(
    "float-window:close-self",
    (event, opts?: { forget?: boolean; dock?: boolean }) => {
      return closeFloatWindowByWebContents(event.sender, {
        forget: opts?.forget === true,
        dock: opts?.dock === true,
      });
    },
  );

  ipcMain.handle("float-window:navigate-main", (_event, route: string) => {
    if (typeof route !== "string" || !route.startsWith("/")) return false;
    if (!focusMainWindow()) return false;
    const main = getMainWindow();
    if (!main || main.isDestroyed()) return false;
    try {
      main.webContents.send(FLOAT_WINDOW_NAVIGATE_CHANNEL, { route });
    } catch {
      return false;
    }
    return true;
  });

  ipcMain.handle("float-window:list", () => listFloatKeys());
}

export function focusMainWindowForFloat(): boolean {
  return focusMainWindow();
}
