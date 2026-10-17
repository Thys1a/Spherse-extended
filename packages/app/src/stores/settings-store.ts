import { create } from "zustand";
import { normalizeLocale, type Locale } from "@spherse/i18n";
import type { TtsSettings, ProxySettings } from "@spherse/core";
import type { HostBridge, NotificationSettings, ThemeMode } from "../lib/host-bridge";

const DEFAULT_DESKTOP_PREFS = {
  theme: "system" as ThemeMode,
  debugToolsEnabled: false,
  closeToTray: true,
  tts: {},
  proxy: {},
  notifications: {},
};

interface SettingsStore {
  loaded: boolean;
  locale: Locale;
  debugToolsEnabled: boolean;
  closeToTray: boolean;
  theme: ThemeMode;
  tts: TtsSettings;
  proxy: ProxySettings;
  notifications: NotificationSettings;
  loadPrefs: (bridge: HostBridge) => Promise<void>;
  changeLocale: (bridge: HostBridge, locale: Locale) => Promise<boolean>;
  setDebugToolsEnabled: (bridge: HostBridge, enabled: boolean) => Promise<boolean>;
  setCloseToTray: (bridge: HostBridge, enabled: boolean) => Promise<boolean>;
  setTheme: (bridge: HostBridge, theme: ThemeMode) => Promise<boolean>;
  setTts: (bridge: HostBridge, patch: Partial<TtsSettings>) => Promise<boolean>;
  setProxy: (bridge: HostBridge, patch: Partial<ProxySettings>) => Promise<boolean>;
  setNotifications: (bridge: HostBridge, patch: Partial<NotificationSettings>) => Promise<boolean>;
}

type DesktopOnlyPrefs = Pick<SettingsStore, "debugToolsEnabled" | "closeToTray" | "theme" | "tts" | "proxy" | "notifications">;

export const useSettingsStore = create<SettingsStore>((set, get) => {
  async function persistDesktopPrefs(bridge: HostBridge, patch: Partial<DesktopOnlyPrefs>): Promise<boolean> {
    const prefs = bridge.desktopPrefs;
    if (!prefs) return false;
    return prefs.savePrefs({
      theme: patch.theme ?? get().theme,
      debugToolsEnabled: patch.debugToolsEnabled ?? get().debugToolsEnabled,
      closeToTray: patch.closeToTray ?? get().closeToTray,
      tts: patch.tts ?? get().tts,
      proxy: patch.proxy ?? get().proxy,
      notifications: patch.notifications ?? get().notifications,
    });
  }

  function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
    for (const key of Object.keys(value)) {
      if (value[key] === undefined) delete value[key];
    }
    return value;
  }

  return {
    loaded: false,
    locale: "zh-CN",
    debugToolsEnabled: false,
    closeToTray: true,
    theme: "system",
    tts: {},
    proxy: {},
    notifications: {},

    async loadPrefs(bridge) {
      const [general, desktop] = await Promise.all([
        bridge.prefs.getPrefs().catch(() => null),
        bridge.desktopPrefs?.getPrefs().catch(() => null) ?? Promise.resolve(null),
      ]);
      const { theme, debugToolsEnabled, closeToTray, tts, proxy, notifications } = desktop ?? {};
      set({
        loaded: true,
        locale: normalizeLocale(general?.locale),
        ...DEFAULT_DESKTOP_PREFS,
        ...(theme !== undefined ? { theme } : {}),
        ...(debugToolsEnabled !== undefined ? { debugToolsEnabled } : {}),
        ...(closeToTray !== undefined ? { closeToTray } : {}),
        ...(tts !== undefined ? { tts } : {}),
        ...(proxy !== undefined ? { proxy } : {}),
        ...(notifications !== undefined ? { notifications } : {}),
      });
    },

    async changeLocale(bridge, locale) {
      set({ locale });
      return bridge.prefs.savePrefs({ locale });
    },

    async setDebugToolsEnabled(bridge, enabled) {
      set({ debugToolsEnabled: enabled });
      return persistDesktopPrefs(bridge, { debugToolsEnabled: enabled });
    },

    async setCloseToTray(bridge, enabled) {
      set({ closeToTray: enabled });
      return persistDesktopPrefs(bridge, { closeToTray: enabled });
    },

    async setTheme(bridge, theme) {
      set({ theme });
      return persistDesktopPrefs(bridge, { theme });
    },

    async setTts(bridge, patch) {
      const next = pruneUndefined({ ...get().tts, ...patch });
      set({ tts: next });
      return persistDesktopPrefs(bridge, { tts: next });
    },

    async setProxy(bridge, patch) {
      const next = pruneUndefined({ ...get().proxy, ...patch });
      set({ proxy: next });
      return persistDesktopPrefs(bridge, { proxy: next });
    },

    async setNotifications(bridge, patch) {
      const next = { ...get().notifications, ...patch };
      set({ notifications: next });
      return persistDesktopPrefs(bridge, { notifications: next });
    },
  };
});
