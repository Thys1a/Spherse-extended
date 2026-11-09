import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppUserModelId } from "./app-id.js";
import { resolveWindowIconPath } from "./window-icon.js";
import { closeAllFloats } from "./float-window.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export type RendererLoad =
  | { type: "url"; url: string }
  | { type: "file"; file: string };

export function resolvePreloadPath(): string {
  return path.join(__dirname, "../../preload/index.js");
}

export function resolveRendererLoad(): RendererLoad {
  if (process.env.ELECTRON_RENDERER_URL) {
    return { type: "url", url: process.env.ELECTRON_RENDERER_URL };
  }
  return { type: "file", file: path.join(__dirname, "../../renderer/index.html") };
}

export function createWindow(): BrowserWindow {
  const iconPath = resolveWindowIconPath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const windowAppId = resolveAppUserModelId({
    platform: process.platform,
    isPackaged: app.isPackaged,
  });
  if (windowAppId) {
    try {
      mainWindow.setAppDetails({
        appId: windowAppId,
        appIconPath: iconPath,
        appIconIndex: 0,
        relaunchCommand: `"${process.execPath}"`,
        relaunchDisplayName: app.getName(),
      });
    } catch (err) {
      console.error("[window] setAppDetails failed:", err);
    }
  }

  const load = resolveRendererLoad();
  if (load.type === "url") {
    mainWindow.loadURL(load.url);
  } else {
    mainWindow.loadFile(load.file);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    closeAllFloats();
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
