import { app, crashReporter } from "electron";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { createWindow, getMainWindow } from "./window.js";
import { restoreEnvFromSettings, getMobileAccess } from "./settings.js";
import { fixPath } from "./fix-path.js";
import { ensureServer, stopServer, getServerPort } from "./server.js";
import { registerAllIpc } from "./ipc/index.js";
import { startAutoUpdateChecks } from "./updater.js";
import { setupContextMenu } from "./ipc/context-menu.js";
import { getTunnelManager } from "./tunnel/manager.js";
import { settleWithin } from "@spherse/core";
import {
  decideRendererRecovery,
  resolveCrashLogDir,
  safeAppendCrashLog,
} from "./crash-log.js";

if (process.platform === "win32") {
  app.setAppUserModelId("com.spherse.app");
}

crashReporter.start({ submitURL: "", uploadToServer: false });

function crashLogDir(): string {
  return resolveCrashLogDir(app.getPath("userData"));
}

function nowIso(): string {
  return new Date().toISOString();
}

let rendererCrashTimes: number[] = [];
let rendererCrashed = false;

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
  if (!main || webContents !== main.webContents) return;
  const cleanExit = details.reason === "clean-exit";
  const decision = decideRendererRecovery({
    cleanExit,
    quitting,
    windowDestroyed: main.isDestroyed(),
    crashTimes: rendererCrashTimes,
    now: Date.now(),
  });
  rendererCrashTimes = decision.crashTimes;
  if (decision.action === "none") {
    if (!cleanExit && !quitting && !main.isDestroyed()) {
      showCrashErrorPage(main);
    }
    return;
  }
  rendererCrashed = decision.action === "recreate";
  if (decision.action === "reload" && !main.isDestroyed()) {
    main.webContents.reload();
  }
});

function showCrashErrorPage(win: { loadURL: (url: string) => Promise<void> }): void {
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
  await fixPath();
  restoreEnvFromSettings();
  setGlobalDispatcher(new EnvHttpProxyAgent());
  await ensureServer();
  createWindow();
  setupContextMenu(getMainWindow()!);
  registerAllIpc(getMainWindow);
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

let quitting = false;
async function gracefulShutdown(): Promise<void> {
  if (quitting) return;
  quitting = true;
  setTimeout(() => {
    console.error("[main] graceful shutdown timed out, forcing app exit");
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
  if (rendererCrashed && !quitting) {
    rendererCrashed = false;
    const main = getMainWindow();
    if (!main || main.isDestroyed()) {
      createWindow();
      return;
    }
  }
  void gracefulShutdown();
});

app.on("before-quit", (event) => {
  if (!quitting) {
    event.preventDefault();
    void gracefulShutdown();
  }
});
