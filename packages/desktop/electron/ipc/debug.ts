import { app, ipcMain, BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { settingsStore } from "../settings.js";

export function registerDebugIpc(getWindow: () => BrowserWindow | null): void {
  function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
    try {
      return BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    } catch {
      return getWindow();
    }
  }

  ipcMain.handle("is-dev", () => {
    return !app.isPackaged;
  });

  ipcMain.handle("toggle-dev-tools", (event) => {
    const win = senderWindow(event);
    if (!win) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools();
    }
  });

  ipcMain.handle("is-dev-tools-open", (event) => {
    const win = senderWindow(event);
    return win?.webContents.isDevToolsOpened() ?? false;
  });

  ipcMain.handle("get-electron-store-data", () => {
    return settingsStore.store;
  });

  ipcMain.handle("reload-renderer", (event) => {
    const win = senderWindow(event);
    win?.webContents.reload();
  });

  ipcMain.handle("reset-app-data", () => {
    settingsStore.clear();
    app.relaunch();
    app.exit(0);
  });
}
