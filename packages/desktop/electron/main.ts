import { app, crashReporter, type BrowserWindow } from "electron";
import path from "node:path";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { resolveAppUserModelId } from "./app-id.js";
import { createWindow, getMainWindow } from "./window.js";
import { getMobileAccess } from "./settings.js";
import { migrateLegacySettings } from "./migrate-legacy-settings.js";
import { fixPath } from "./fix-path.js";
import { ensureServer, stopServer, getServerPort } from "./server.js";
import { registerAllIpc } from "./ipc/index.js";
import { startAutoUpdateChecks } from "./updater.js";
import { setupContextMenu } from "./ipc/context-menu.js";
import { getTunnelManager } from "./tunnel/manager.js";
import { settleWithin } from "@spherse/core";
import {
  decideRendererRecovery,
  decideWindowsClosed,
  resolveCrashLogDir,
  safeAppendCrashLog,
} from "./crash-log.js";
import { beginQuit, isQuitting } from "./lifecycle.js";
import { removeStaleElectronShortcut } from "./stale-electron-shortcut.js";
import { attachCloseToTray, destroyTray, showMainWindow, syncTray } from "./tray.js";

const appUserModelId = resolveAppUserModelId({
  isPackaged: app.isPackaged,
  platform: process.platform,
});
if (appUserModelId) {
  app.setAppUserModelId(appUserModelId);
}

crashReporter.start({ submitURL: "", uploadToServer: false });

function crashLogDir(): string {
  return resolveCrashLogDir(app.getPath("userData"));
}

function nowIso(): string {
  return new Date().toISOString();
}

let rendererCrashTimes: number[] = [];
let lastCrashAt: number | null = null;
let backoffExhausted = false;

function readWebContentsUrl(wc: { getURL?: () => string } | null | undefined): string | undefined {
  try {
    return wc?.getURL?.();
  } catch {
    return undefined;
  }
}

app.on("render-process-gone", (_event, webContents, details) => {
  safeAppendCrashLog(crashLogDir(), {
    time: nowIso(),
    proc: "renderer",
    reason: details.reason,
    exitCode: details.exitCode,
    url: readWebContentsUrl(webContents),
  });
  const main = getMainWindow();
  if (main && webContents !== main.webContents) return;
  const cleanExit = details.reason === "clean-exit";
  const destroyed = !main || main.isDestroyed();
  const now = Date.now();
  const decision = decideRendererRecovery({
    cleanExit,
    quitting: isQuitting(),
    windowDestroyed: destroyed,
    crashTimes: rendererCrashTimes,
    now,
  });
  rendererCrashTimes = decision.crashTimes;
  if (decision.action === "none") {
    if (cleanExit || isQuitting()) return;
    if (!destroyed && main) {
      showCrashErrorPage(main);
    } else {
      backoffExhausted = true;
    }
    return;
  }
  lastCrashAt = now;
  if (decision.action === "reload" && main && !main.isDestroyed()) {
    main.webContents.reload();
  }
});

function showCrashErrorPage(win: BrowserWindow): void {
  const html = "<body style='font-family:sans-serif;padding:40px'><h1>Spherse 渲染进程多次崩溃，已停止自动恢复</h1><p>崩溃记录见日志目录 crash.jsonl。重启应用可继续使用。</p></body>";
  try {
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch {
    console.error("[main] failed to show crash error page");
  }
}

app.on("child-process-gone", (_event, details) => {
  safeAppendCrashLog(crashLogDir(), {
    time: nowIso(),
    proc: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    name: details.name,
  });
});

process.on("uncaughtException", (err) => {
  safeAppendCrashLog(crashLogDir(), {
    time: nowIso(),
    proc: "main",
    kind: "uncaughtException",
    stack: err?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  safeAppendCrashLog(crashLogDir(), {
    time: nowIso(),
    proc: "main",
    kind: "unhandledRejection",
    stack: reason instanceof Error ? reason.stack : String(reason),
  });
});

app.whenReady().then(async () => {
  if (appUserModelId) {
    try {
      const outcome = removeStaleElectronShortcut({
        startMenuDir: path.join(
          app.getPath("appData"),
          "Microsoft",
          "Windows",
          "Start Menu",
          "Programs",
        ),
        expectedAppUserModelId: appUserModelId,
      });
      if (outcome === "removed") {
        console.log("[main] removed stale Electron.lnk sharing our AppUserModelId");
      }
    } catch (err) {
      console.error("[main] stale shortcut cleanup failed:", err);
    }
  }
  await fixPath();
  migrateLegacySettings();
  setGlobalDispatcher(new EnvHttpProxyAgent());
  await ensureServer();
  setupMainWindow(createWindow());
  registerAllIpc(getMainWindow);
  syncTray();
  startAutoUpdateChecks();

  const mobile = getMobileAccess();
  if (mobile.enabled && (mobile.mode ?? "quick") === "quick") {
    try {
      void getTunnelManager().start(getServerPort());
    } catch (err) {
      console.error("[main] failed to start tunnel on launch:", err);
    }
  }
});

const TUNNEL_STOP_TIMEOUT_MS = 5_000;
const GRACEFUL_SHUTDOWN_HARD_EXIT_MS = 30_000;

function setupMainWindow(win: BrowserWindow): void {
  setupContextMenu(win);
  attachCloseToTray(win);
}

async function gracefulShutdown(): Promise<void> {
  if (!beginQuit()) return;
  setTimeout(() => {
    console.error("[main] graceful shutdown timed out, forcing app exit");
    destroyTray();
    app.exit(1);
  }, GRACEFUL_SHUTDOWN_HARD_EXIT_MS).unref();
  await settleWithin(getTunnelManager().stop(), TUNNEL_STOP_TIMEOUT_MS, (outcome, detail) => {
    if (outcome === "error") {
      console.error("[main] tunnel stop failed:", detail);
    } else {
      console.error(`[main] tunnel stop timed out after ${TUNNEL_STOP_TIMEOUT_MS}ms, continuing`);
    }
  });
  await stopServer();
  app.quit();
}

app.on("window-all-closed", () => {
  const main = getMainWindow();
  const decision = decideWindowsClosed({
    quitting: isQuitting(),
    lastCrashAt,
    backoffExhausted,
    hasLiveWindow: !!main && !main.isDestroyed(),
    now: Date.now(),
  });
  backoffExhausted = false;
  lastCrashAt = null;
  if (decision.recreate) {
    const win = createWindow();
    setupMainWindow(win);
    if (decision.showErrorPage) showCrashErrorPage(win);
    return;
  }
  void gracefulShutdown();
});

app.on("before-quit", (event) => {
  if (!isQuitting()) {
    event.preventDefault();
    void gracefulShutdown();
  }
});

app.on("will-quit", () => {
  destroyTray();
});

app.on("activate", () => {
  void showMainWindow();
});

app.on("second-instance", () => {
  void showMainWindow();
});
