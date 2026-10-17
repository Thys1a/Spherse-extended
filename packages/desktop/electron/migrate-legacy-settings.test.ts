import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({
  userDataDir: "",
  themeSource: "system" as string,
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {};
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    delete(key: string) {
      delete this.data[key];
    }
    clear() {
      this.data = {};
    }
  },
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => state.userDataDir,
  },
  nativeTheme: {
    set themeSource(value: string) {
      state.themeSource = value;
    },
    get themeSource() {
      return state.themeSource;
    },
  },
}));

import { migrateLegacySettings } from "./migrate-legacy-settings.js";
import { settingsStore, getHostPrefs, getMobileAccess, getServerToken } from "./settings.js";

function legacySettings() {
  return {
    locale: "en",
    models: {
      text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-1" } }, sampling: { temperature: 0.5 } },
      image: { defaultModel: "", providers: {} },
    },
    customProviders: [],
    debugToolsEnabled: true,
    closeToTray: false,
    theme: "dark",
    mobileAccess: { enabled: true, token: "tok-123", mode: "quick" as const },
    tts: { voiceURI: "v", rate: 1.2 },
    proxy: { url: "http://127.0.0.1:7890" },
    webSearch: { apiKey: "sk-ws", baseUrl: "https://ws.example", model: "m" },
    notifications: { approval: false },
  };
}

function modelSettingsPath(): string {
  return path.join(state.userDataDir, "model-settings.json");
}

function webSearchSettingsPath(): string {
  return path.join(state.userDataDir, "web-search-settings.json");
}

let tmpDirs: string[] = [];

beforeEach(() => {
  settingsStore.clear();
  state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-migrate-test-"));
  tmpDirs.push(state.userDataDir);
  state.themeSource = "system";
  (settingsStore as unknown as Record<string, unknown>).path = path.join(state.userDataDir, "settings.json");
});

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("migrateLegacySettings", () => {
  it("is a no-op without a legacy settings key but still applies theme", () => {
    settingsStore.set("hostPrefs", { locale: "en", theme: "dark", debugToolsEnabled: false, closeToTray: true });
    migrateLegacySettings();

    expect(fs.existsSync(modelSettingsPath())).toBe(false);
    expect(state.themeSource).toBe("dark");
  });

  it("splits legacy settings across partitions and deletes the old key", () => {
    settingsStore.set("settings", legacySettings());
    migrateLegacySettings();

    expect(JSON.parse(fs.readFileSync(modelSettingsPath(), "utf-8")).text.defaultModel).toBe("openai/gpt-4o");
    expect(JSON.parse(fs.readFileSync(modelSettingsPath(), "utf-8")).text.providers).toEqual({ openai: { apiKey: "sk-1" } });
    expect(JSON.parse(fs.readFileSync(webSearchSettingsPath(), "utf-8"))).toMatchObject({ apiKey: "sk-ws" });
    expect(getHostPrefs()).toMatchObject({
      locale: "en",
      theme: "dark",
      debugToolsEnabled: true,
      closeToTray: false,
      tts: { voiceURI: "v", rate: 1.2 },
      proxy: { url: "http://127.0.0.1:7890" },
      notifications: { approval: false },
    });
    expect(getMobileAccess()).toMatchObject({ enabled: true, mode: "quick" });
    expect(getServerToken()).toBe("tok-123");
    expect(settingsStore.get("settings")).toBeUndefined();
  });

  it("writes a backup of the legacy settings before deleting", () => {
    settingsStore.set("settings", legacySettings());
    migrateLegacySettings();

    const bakFiles = fs.readdirSync(state.userDataDir).filter((f) => f.endsWith(".bak"));
    expect(bakFiles).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(state.userDataDir, bakFiles[0]), "utf-8")).settings.locale).toBe("en");
  });

  it("skips partitions that already exist", () => {
    fs.writeFileSync(
      modelSettingsPath(),
      JSON.stringify({ text: { defaultModel: "existing/m", providers: {} }, image: { defaultModel: "", providers: {} }, customProviders: [] }),
    );
    settingsStore.set("settings", legacySettings());
    migrateLegacySettings();

    expect(JSON.parse(fs.readFileSync(modelSettingsPath(), "utf-8")).text.defaultModel).toBe("existing/m");
    expect(settingsStore.get("settings")).toBeUndefined();
  });
});
