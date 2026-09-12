import { create } from "zustand";
import { normalizeLocale, type Locale } from "@spherse/i18n";
import type { TtsSettings, ProxySettings } from "@spherse/core";
import type { HostBridge, NotificationSettings, ThemeMode } from "../lib/host-bridge";

export type SettingsStoreApi = Pick<HostBridge, "getSettings" | "saveSettings">;

interface SettingsStore {
  locale: Locale;
  debugToolsEnabled: boolean;
  theme: ThemeMode;
  tts: TtsSettings;
  proxy: ProxySettings;
  notifications: NotificationSettings;
  loadLocale: (api: SettingsStoreApi) => Promise<void>;
  changeLocale: (api: SettingsStoreApi, locale: Locale) => Promise<boolean>;
  setDebugToolsEnabled: (api: SettingsStoreApi, enabled: boolean) => Promise<boolean>;
  setTheme: (api: SettingsStoreApi, theme: ThemeMode) => Promise<boolean>;
  setTts: (api: SettingsStoreApi, patch: Partial<TtsSettings>) => Promise<boolean>;
  setProxy: (api: SettingsStoreApi, patch: Partial<ProxySettings>) => Promise<boolean>;
  setNotifications: (api: SettingsStoreApi, patch: Partial<NotificationSettings>) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  locale: "zh-CN",
  debugToolsEnabled: false,
  theme: "system",
  tts: {},
  proxy: {},
  notifications: {},

  async loadLocale(api) {
    const settings = await api.getSettings();
    set({
      locale: normalizeLocale(settings?.locale),
      debugToolsEnabled: settings?.debugToolsEnabled ?? false,
      theme: settings?.theme ?? "system",
      tts: settings?.tts ?? {},
      proxy: settings?.proxy ?? {},
      notifications: settings?.notifications ?? {},
    });
  },

  async changeLocale(api, locale) {
    set({ locale });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale,
      models: settings?.models,
      debugToolsEnabled: get().debugToolsEnabled,
      theme: get().theme,
      tts: get().tts,
      proxy: get().proxy,
      notifications: get().notifications,
    });
    return true;
  },

  async setDebugToolsEnabled(api, enabled) {
    set({ debugToolsEnabled: enabled });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale: settings?.locale ?? get().locale,
      models: settings?.models,
      debugToolsEnabled: enabled,
      theme: get().theme,
      tts: get().tts,
      proxy: get().proxy,
      notifications: get().notifications,
    });
    return true;
  },

  async setTheme(api, theme) {
    set({ theme });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale: settings?.locale ?? get().locale,
      models: settings?.models,
      debugToolsEnabled: get().debugToolsEnabled,
      theme,
      tts: get().tts,
      proxy: get().proxy,
      notifications: get().notifications,
    });
    return true;
  },

  async setTts(api, patch) {
    const next = { ...get().tts, ...patch };
    set({ tts: next });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale: settings?.locale ?? get().locale,
      models: settings?.models,
      debugToolsEnabled: get().debugToolsEnabled,
      theme: get().theme,
      tts: next,
      proxy: get().proxy,
      notifications: get().notifications,
    });
    return true;
  },

  async setProxy(api, patch) {
    const next = { ...get().proxy, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (next[key] === undefined) delete next[key];
    }
    set({ proxy: next });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale: settings?.locale ?? get().locale,
      models: settings?.models,
      debugToolsEnabled: get().debugToolsEnabled,
      theme: get().theme,
      tts: get().tts,
      proxy: next,
      notifications: get().notifications,
    });
    return true;
  },

  async setNotifications(api, patch) {
    const next = { ...get().notifications, ...patch };
    set({ notifications: next });
    const settings = await api.getSettings();
    await api.saveSettings({
      locale: settings?.locale ?? get().locale,
      models: settings?.models,
      debugToolsEnabled: get().debugToolsEnabled,
      theme: get().theme,
      tts: get().tts,
      proxy: get().proxy,
      notifications: next,
    });
    return true;
  },
}));
