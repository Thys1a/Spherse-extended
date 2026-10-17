import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { ModelSettingsStore, WebSearchSettingsStore } from "@spherse/server";
import type { ThemeMode } from "@spherse/app/host-bridge";
import {
  settingsStore,
  getModelSettingsPath,
  getWebSearchSettingsPath,
  applyHostPrefsToEnv,
  defaultCloseToTray,
  type LegacySettings,
} from "./settings.js";

function normalizeTheme(raw: string | undefined): ThemeMode {
  return raw === "light" || raw === "dark" ? raw : "system";
}

function backupLegacySettings(legacy: LegacySettings): void {
  try {
    const storePath = (settingsStore as unknown as { path?: unknown }).path;
    if (typeof storePath !== "string") return;
    const backupPath = `${storePath}.bak`;
    writeFileSync(backupPath, JSON.stringify({ settings: legacy }, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    chmodSync(backupPath, 0o600);
  } catch {
    return;
  }
}

function seedModelSettings(legacy: LegacySettings): void {
  const filePath = getModelSettingsPath();
  if (existsSync(filePath) || !legacy.models) return;
  new ModelSettingsStore({ filePath }).applyUpdate({
    models: {
      text: {
        defaultModel: legacy.models.text?.defaultModel ?? "",
        providers: legacy.models.text?.providers,
        sampling: legacy.models.text?.sampling,
        thinkingLevel: legacy.models.text?.thinkingLevel,
      },
      image: {
        defaultModel: legacy.models.image?.defaultModel ?? "",
        providers: legacy.models.image?.providers,
      },
    },
    customProviders: legacy.customProviders,
  });
}

function seedWebSearchSettings(legacy: LegacySettings): void {
  const filePath = getWebSearchSettingsPath();
  if (existsSync(filePath) || !legacy.webSearch) return;
  new WebSearchSettingsStore({ filePath }).applyUpdate({
    apiKey: legacy.webSearch.apiKey,
    baseUrl: legacy.webSearch.baseUrl,
    model: legacy.webSearch.model,
  });
}

export function migrateLegacySettings(): void {
  const legacy = settingsStore.get("settings") as LegacySettings | undefined;
  if (legacy) {
    backupLegacySettings(legacy);
    if (!settingsStore.get("serverToken") && legacy.mobileAccess?.token) {
      settingsStore.set("serverToken", legacy.mobileAccess.token);
    }
    seedModelSettings(legacy);
    seedWebSearchSettings(legacy);
    if (!settingsStore.get("hostPrefs")) {
      settingsStore.set("hostPrefs", {
        locale: legacy.locale ?? "zh-CN",
        theme: normalizeTheme(legacy.theme),
        debugToolsEnabled: legacy.debugToolsEnabled ?? false,
        closeToTray: legacy.closeToTray ?? defaultCloseToTray(),
        tts: legacy.tts,
        proxy: legacy.proxy,
        notifications: legacy.notifications,
      });
    }
    if (!settingsStore.get("mobileAccess") && legacy.mobileAccess) {
      settingsStore.set("mobileAccess", {
        enabled: legacy.mobileAccess.enabled ?? false,
        mode: legacy.mobileAccess.mode ?? "quick",
        publicDomain: legacy.mobileAccess.publicDomain,
      });
    }
    settingsStore.delete("settings");
  }
  applyHostPrefsToEnv();
}
