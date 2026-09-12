import { Notification, ipcMain, type BrowserWindow } from "electron";

export function registerNotificationIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    "show-notification",
    (_event, opts: { title: string; body: string }) => {
      const notification = new Notification({
        title: opts.title,
        body: opts.body,
      });
      notification.on("click", () => {
        const window = getWindow();
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.focus();
      });
      notification.show();
    },
  );
}
