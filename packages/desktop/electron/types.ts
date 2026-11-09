import type {
  DesktopPrefs,
  GeneralPrefs,
  MobileAccessEvent,
  MobileAccessState,
  MobileTunnelMode,
  RestoredProject,
  SaveDialogOptions,
  ThemeMode,
  UpdateEvent,
  UpdateState,
} from "@spherse/app/host-bridge";

export type {
  MobileAccessEvent,
  MobileAccessState,
  MobileTunnelMode,
  RestoredProject,
  SaveDialogOptions,
  ThemeMode,
  UpdateEvent,
  UpdateState,
};

export type FloatWindowKind = "chat" | "content";

export interface FloatWindowOpenOptions {
  kind: FloatWindowKind;
  projectId: string;
  itemKey: string;
}

export interface FloatWindowCloseSelfOptions {
  forget?: boolean;
  dock?: boolean;
}

export interface FloatWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  selectSkillZip: () => Promise<string | null>;
  openProject: (projectRoot: string) => Promise<{ projectId: string } | null>;
  getServerPort: () => Promise<number>;
  restoreProjects: () => Promise<RestoredProject[]>;
  addOpenProject: (projectId: string, projectRoot: string) => Promise<void>;
  closeProject: (projectId: string, projectPath: string) => Promise<void>;
  openProjectFolder: (projectRoot: string) => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  showNotification: (opts: { title: string; body: string; route?: string }) => Promise<void>;
  onNotificationClicked: (callback: (route: string) => void) => () => void;
  setLastActiveProject: (projectId: string) => Promise<void>;
  getLastActiveProject: () => Promise<string | null>;
  getGeneralPrefs: () => Promise<GeneralPrefs>;
  saveGeneralPrefs: (prefs: GeneralPrefs) => Promise<{ success: boolean }>;
  getDesktopPrefs: () => Promise<DesktopPrefs>;
  saveDesktopPrefs: (prefs: DesktopPrefs) => Promise<{ success: boolean }>;
  isDev: () => Promise<boolean>;
  toggleDevTools: () => Promise<void>;
  isDevToolsOpen: () => Promise<boolean>;
  getElectronStoreData: () => Promise<Record<string, unknown>>;
  reloadRenderer: () => Promise<void>;
  resetAppData: () => Promise<void>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<string | null>;
  checkForUpdates: (opts: { silent: boolean }) => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  cancelUpdate: () => Promise<void>;
  getUpdateState: () => Promise<UpdateState>;
  getAppVersion: () => Promise<string>;
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => () => void;
  getMobileAccessState: () => Promise<MobileAccessState>;
  enableMobileAccess: (options?: { mode?: MobileTunnelMode; publicDomain?: string }) => Promise<MobileAccessState>;
  disableMobileAccess: () => Promise<MobileAccessState>;
  regenerateToken: () => Promise<MobileAccessState>;
  restartTunnel: () => Promise<MobileAccessState>;
  setMobileMode: (mode: MobileTunnelMode) => Promise<MobileAccessState>;
  setPublicDomain: (domain: string) => Promise<MobileAccessState>;
  onMobileAccessEvent: (callback: (event: MobileAccessEvent) => void) => () => void;
  floatWindowOpen: (options: FloatWindowOpenOptions) => Promise<{ ok: true } | null>;
  floatWindowCloseSelf: (options?: FloatWindowCloseSelfOptions) => Promise<boolean>;
  floatWindowNavigateMain: (route: string) => Promise<boolean>;
  floatWindowList: () => Promise<string[]>;
  onFloatWindowClosed: (callback: (payload: FloatWindowClosedPayload) => void) => () => void;
  onFloatWindowNavigateMain: (callback: (payload: { route: string }) => void) => () => void;
}
