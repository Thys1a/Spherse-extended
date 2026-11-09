import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI, FloatWindowCloseSelfOptions, FloatWindowOpenOptions, UpdateEvent } from "./types.js";
import type { MobileAccessEvent } from "@spherse/app/host-bridge";

const UPDATE_EVENT_CHANNELS = [
  "update-available",
  "update-not-available",
  "download-progress",
  "update-downloaded",
  "update-error",
] as const;

const MOBILE_EVENT_CHANNEL = "mobile-access:event";
const NOTIFICATION_CLICK_CHANNEL = "notification-clicked";
const FLOAT_WINDOW_CLOSED_CHANNEL = "float-window:closed";
const FLOAT_WINDOW_NAVIGATE_CHANNEL = "float-window:navigate-main";

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  selectSkillZip: () => ipcRenderer.invoke("select-skill-zip"),
  openProject: (projectRoot: string) =>
    ipcRenderer.invoke("open-project", projectRoot),
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  getGeneralPrefs: () => ipcRenderer.invoke("get-general-prefs"),
  saveGeneralPrefs: (prefs: unknown) =>
    ipcRenderer.invoke("save-general-prefs", prefs),
  getDesktopPrefs: () => ipcRenderer.invoke("get-desktop-prefs"),
  saveDesktopPrefs: (prefs: unknown) =>
    ipcRenderer.invoke("save-desktop-prefs", prefs),
  restoreProjects: () => ipcRenderer.invoke("restore-projects"),
  addOpenProject: (projectId: string, projectRoot: string) =>
    ipcRenderer.invoke("add-open-project", projectId, projectRoot),
  closeProject: (projectId: string, projectPath: string) =>
    ipcRenderer.invoke("close-project", projectId, projectPath),
  openProjectFolder: (projectRoot: string) =>
    ipcRenderer.invoke("open-project-folder", projectRoot),
  openFile: (filePath: string) => ipcRenderer.invoke("open-file", filePath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  showNotification: (opts: { title: string; body: string; route?: string }) =>
    ipcRenderer.invoke("show-notification", opts),
  onNotificationClicked: (callback: (route: string) => void) => {
    const handler = (_e: unknown, payload: { route: string }) => callback(payload.route);
    ipcRenderer.on(NOTIFICATION_CLICK_CHANNEL, handler);
    return () => ipcRenderer.removeListener(NOTIFICATION_CLICK_CHANNEL, handler);
  },
  setLastActiveProject: (projectId: string) =>
    ipcRenderer.invoke("set-last-active-project", projectId),
  getLastActiveProject: () =>
    ipcRenderer.invoke("get-last-active-project"),
  isDev: () => ipcRenderer.invoke("is-dev"),
  toggleDevTools: () => ipcRenderer.invoke("toggle-dev-tools"),
  isDevToolsOpen: () => ipcRenderer.invoke("is-dev-tools-open"),
  getElectronStoreData: () => ipcRenderer.invoke("get-electron-store-data"),
  reloadRenderer: () => ipcRenderer.invoke("reload-renderer"),
  resetAppData: () => ipcRenderer.invoke("reset-app-data"),
  showSaveDialog: (options: { defaultPath?: string }) =>
    ipcRenderer.invoke("show-save-dialog", options),
  checkForUpdates: (opts: { silent: boolean }) =>
    ipcRenderer.invoke("check-for-updates", opts),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  cancelUpdate: () => ipcRenderer.invoke("cancel-update"),
  getUpdateState: () => ipcRenderer.invoke("get-update-state"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => {
    const handler = (_e: unknown, payload: UpdateEvent) => callback(payload);
    UPDATE_EVENT_CHANNELS.forEach((ch) => ipcRenderer.on(ch, handler));
    return () =>
      UPDATE_EVENT_CHANNELS.forEach((ch) =>
        ipcRenderer.removeListener(ch, handler),
      );
  },
  getMobileAccessState: () => ipcRenderer.invoke("mobile-access:get-state"),
  enableMobileAccess: (options?: { mode?: "quick" | "manual"; publicDomain?: string }) =>
    ipcRenderer.invoke("mobile-access:enable", options),
  disableMobileAccess: () => ipcRenderer.invoke("mobile-access:disable"),
  regenerateToken: () => ipcRenderer.invoke("mobile-access:regenerate-token"),
  restartTunnel: () => ipcRenderer.invoke("mobile-access:restart-tunnel"),
  setMobileMode: (mode: "quick" | "manual") => ipcRenderer.invoke("mobile-access:set-mode", mode),
  setPublicDomain: (domain: string) => ipcRenderer.invoke("mobile-access:set-public-domain", domain),
  onMobileAccessEvent: (callback: (event: MobileAccessEvent) => void) => {
    const handler = (_e: unknown, payload: MobileAccessEvent) => callback(payload);
    ipcRenderer.on(MOBILE_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(MOBILE_EVENT_CHANNEL, handler);
  },
  floatWindowOpen: (options: FloatWindowOpenOptions) =>
    ipcRenderer.invoke("float-window:open", options),
  floatWindowCloseSelf: (options?: FloatWindowCloseSelfOptions) =>
    ipcRenderer.invoke("float-window:close-self", options ?? {}),
  floatWindowNavigateMain: (route: string) =>
    ipcRenderer.invoke("float-window:navigate-main", route),
  floatWindowList: () => ipcRenderer.invoke("float-window:list"),
  onFloatWindowClosed: (
    callback: (payload: {
      key: string;
      kind: "chat" | "content";
      projectId: string;
      itemKey: string;
      bounds: { x: number; y: number; width: number; height: number };
      reason: "dock" | "closed" | "crashed";
    }) => void,
  ) => {
    const handler = (_e: unknown, payload: {
      key: string;
      kind: "chat" | "content";
      projectId: string;
      itemKey: string;
      bounds: { x: number; y: number; width: number; height: number };
      reason: "dock" | "closed" | "crashed";
    }) => callback(payload);
    ipcRenderer.on(FLOAT_WINDOW_CLOSED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(FLOAT_WINDOW_CLOSED_CHANNEL, handler);
  },
  onFloatWindowNavigateMain: (callback: (payload: { route: string }) => void) => {
    const handler = (_e: unknown, payload: { route: string }) => callback(payload);
    ipcRenderer.on(FLOAT_WINDOW_NAVIGATE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(FLOAT_WINDOW_NAVIGATE_CHANNEL, handler);
  },
} satisfies ElectronAPI);
