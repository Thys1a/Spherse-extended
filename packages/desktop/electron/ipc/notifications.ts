import { Notification, ipcMain, type BrowserWindow } from "electron";

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 500;

export const NOTIFICATION_CLICK_CHANNEL = "notification-clicked";

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? "").slice(0, maxLength);
}

export function registerNotificationIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    "show-notification",
    (_event, opts: { title: unknown; body: unknown; route?: unknown }) => {
      try {
        const title = normalizeText(opts?.title, TITLE_MAX_LENGTH);
        const body = normalizeText(opts?.body, BODY_MAX_LENGTH);
        const route = typeof opts?.route === "string" ? opts.route : undefined;
        const notification = new Notification({ title, body });
        notification.on("click", () => {
          const window = getWindow();
          if (!window) return;
          if (window.isMinimized()) window.restore();
          window.focus();
          if (route) window.webContents.send(NOTIFICATION_CLICK_CHANNEL, { route });
        });
        notification.show();
      } catch (err) {
        console.warn("[notifications] failed to show notification:", err);
      }
    },
  );
}
