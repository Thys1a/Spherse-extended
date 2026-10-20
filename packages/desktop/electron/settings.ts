import path from "node:path";
import crypto from "node:crypto";
import { app, nativeTheme } from "electron";
import Store from "electron-store";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import type { MobileAccessSettings, ModelGroupSettings, ProxySettings } from "@spherse/core";
import type { DesktopPrefs, GeneralPrefs, ThemeMode } from "@spherse/app/host-bridge";

export interface OpenProjectEntry {
  id: string;
  path: string;
  name: string;
  lastOpened: string;
}

export interface LegacySettings {
  locale?: string;
  models?: { text?: Partial<ModelGroupSettings>; image?: Partial<ModelGroupSettings> };
  customProviders?: { id: string; name: string; baseUrl: string; models: string[]; keyless: boolean }[];
  debugToolsEnabled?: boolean;
  closeToTray?: boolean;
  theme?: string;
  mobileAccess?: { enabled?: boolean; token?: string; mode?: "quick" | "manual"; publicDomain?: string };
  tts?: DesktopPrefs["tts"];
  proxy?: DesktopPrefs["proxy"];
  webSearch?: { apiKey?: string; baseUrl?: string; model?: string };
  notifications?: DesktopPrefs["notifications"];
}

type SettingsSchema = {
  settings?: LegacySettings;
  hostPrefs?: DesktopPrefs & GeneralPrefs;
  mobileAccess?: MobileAccessSettings;
  openProjects?: OpenProjectEntry[];
  lastActiveProject?: string | null;
  serverToken?: string;
};

export const settingsStore = new Store<SettingsSchema>({
  name: "settings",
});

export function getModelSettingsPath(): string {
  return path.join(app.getPath("userData"), "model-settings.json");
}

export function getWebSearchSettingsPath(): string {
  return path.join(app.getPath("userData"), "web-search-settings.json");
}

function defaultHostPrefs(): DesktopPrefs & GeneralPrefs {
  return {
    locale: "zh-CN",
    theme: "system",
    debugToolsEnabled: false,
    closeToTray: defaultCloseToTray(),
  };
}

export function getHostPrefs(): DesktopPrefs & GeneralPrefs {
  return { ...defaultHostPrefs(), ...settingsStore.get("hostPrefs") };
}

export function getGeneralPrefs(): GeneralPrefs {
  return { locale: getHostPrefs().locale };
}

export function saveGeneralPrefs(prefs: GeneralPrefs): void {
  const current = getHostPrefs();
  settingsStore.set("hostPrefs", { ...current, locale: prefs.locale });
}

export function getDesktopPrefs(): DesktopPrefs {
  const prefs = getHostPrefs();
  return {
    theme: prefs.theme,
    debugToolsEnabled: prefs.debugToolsEnabled,
    closeToTray: prefs.closeToTray,
    tts: prefs.tts ?? {},
    proxy: prefs.proxy ?? {},
    notifications: prefs.notifications ?? {},
  };
}

export function saveDesktopPrefs(prefs: DesktopPrefs): void {
  const current = getHostPrefs();
  settingsStore.set("hostPrefs", { ...current, ...prefs });
  applyThemeSource(prefs.theme);
  if (prefs.proxy !== undefined) applyProxyEnv(prefs.proxy);
}

export function applyThemeSource(theme: ThemeMode): void {
  nativeTheme.themeSource = theme ?? "system";
}

function parseHttpProxyUrl(raw: string | undefined): string | undefined {
  const url = raw?.trim();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function applyProxyEnv(proxy: ProxySettings): void {
  const proxyUrl = parseHttpProxyUrl(proxy.url);
  if (proxyUrl) {
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;
    process.env.https_proxy = proxyUrl;
    process.env.http_proxy = proxyUrl;
  } else {
    if (proxy.url?.trim()) console.warn("[settings] ignoring invalid proxy URL");
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.https_proxy;
    delete process.env.http_proxy;
  }
  const noProxy = proxy.noProxy?.trim();
  if (noProxy) {
    process.env.NO_PROXY = noProxy;
    process.env.no_proxy = noProxy;
  } else {
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  }
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

export function applyHostPrefsToEnv(): void {
  const prefs = getHostPrefs();
  applyThemeSource(prefs.theme);
  if (prefs.proxy !== undefined) applyProxyEnv(prefs.proxy);
}

export function getOpenProjects(): OpenProjectEntry[] {
  return settingsStore.get("openProjects") ?? [];
}

export function addOpenProject(projectId: string, projectPath: string): void {
  const projects = getOpenProjects();
  const idx = projects.findIndex((p) => p.path === projectPath);
  const entry: OpenProjectEntry = {
    id: projectId,
    path: projectPath,
    name: path.basename(projectPath),
    lastOpened: new Date().toISOString(),
  };
  if (idx >= 0) {
    projects[idx] = entry;
  } else {
    projects.push(entry);
  }
  settingsStore.set("openProjects", projects);
}

export function removeOpenProject(projectPath: string): void {
  const projects = getOpenProjects().filter((p) => p.path !== projectPath);
  settingsStore.set("openProjects", projects);
  const lastActive = getLastActiveProject();
  if (lastActive === projectPath) {
    setLastActiveProject(null);
  }
}

export function removeOpenProjectById(projectId: string): void {
  const projects = getOpenProjects().filter((p) => p.id !== projectId);
  settingsStore.set("openProjects", projects);
  const lastActive = getLastActiveProject();
  if (lastActive === projectId) {
    setLastActiveProject(null);
  }
}

export function updateLastOpened(projectPath: string): void {
  const projects = getOpenProjects();
  const entry = projects.find((p) => p.path === projectPath);
  if (entry) {
    entry.lastOpened = new Date().toISOString();
    settingsStore.set("openProjects", projects);
  }
}

export function bumpLastOpenedById(projectId: string): string | null {
  const projects = getOpenProjects();
  const entry = projects.find((p) => p.id === projectId);
  if (!entry) return null;
  const ts = new Date().toISOString();
  entry.lastOpened = ts;
  settingsStore.set("openProjects", projects);
  return ts;
}

export function getLastActiveProject(): string | null {
  return settingsStore.get("lastActiveProject") ?? null;
}

export function setLastActiveProject(projectPath: string | null): void {
  settingsStore.set("lastActiveProject", projectPath);
}

export function defaultCloseToTray(): boolean {
  return app.isPackaged || process.env.NODE_ENV === "test";
}

export function getCloseToTray(): boolean {
  return getHostPrefs().closeToTray;
}

export function getLocale(): string {
  return getHostPrefs().locale;
}

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getServerToken(): string {
  const existing = settingsStore.get("serverToken");
  if (existing) return existing;
  const token = generateAccessToken();
  settingsStore.set("serverToken", token);
  return token;
}

export function setServerToken(token: string): void {
  settingsStore.set("serverToken", token);
}

export function getMobileAccess(): MobileAccessSettings {
  const stored = settingsStore.get("mobileAccess");
  return {
    enabled: stored?.enabled ?? false,
    token: stored?.token,
    mode: stored?.mode ?? "quick",
    publicDomain: stored?.publicDomain,
  };
}

export function setMobileAccess(patch: Partial<MobileAccessSettings>): MobileAccessSettings {
  const current = getMobileAccess();
  const next: MobileAccessSettings = { ...current, ...patch };
  settingsStore.set("mobileAccess", next);
  return next;
}
