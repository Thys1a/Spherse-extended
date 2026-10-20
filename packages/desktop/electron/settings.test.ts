import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  app: { isPackaged: false },
  nativeTheme: { themeSource: "system" },
}));

const { setGlobalDispatcherMock } = vi.hoisted(() => ({ setGlobalDispatcherMock: vi.fn() }));
vi.mock("undici", () => ({
  setGlobalDispatcher: setGlobalDispatcherMock,
  EnvHttpProxyAgent: class {},
}));

import { setGlobalDispatcher } from "undici";

import {
  settingsStore,
  getHostPrefs,
  saveGeneralPrefs,
  saveDesktopPrefs,
  getCloseToTray,
  getLocale,
  applyProxyEnv,
  applyHostPrefsToEnv,
  getMobileAccess,
  setMobileAccess,
  getServerToken,
  setServerToken,
  generateAccessToken,
} from "./settings.js";

beforeEach(() => {
  settingsStore.clear();
});

describe("host prefs", () => {
  it("returns defaults on fresh install", () => {
    expect(getHostPrefs()).toMatchObject({
      locale: "zh-CN",
      theme: "system",
      debugToolsEnabled: false,
      closeToTray: true,
    });
  });

  it("round-trips general prefs without touching desktop prefs", () => {
    saveDesktopPrefs({ theme: "dark", debugToolsEnabled: true, closeToTray: false });
    saveGeneralPrefs({ locale: "en" });

    expect(getHostPrefs()).toMatchObject({ locale: "en", theme: "dark", debugToolsEnabled: true, closeToTray: false });
  });

  it("merges desktop prefs preserving untouched fields", () => {
    saveDesktopPrefs({ theme: "dark", debugToolsEnabled: false, closeToTray: true, tts: { voiceURI: "v" } });
    saveDesktopPrefs({ theme: "light", debugToolsEnabled: false, closeToTray: true });

    expect(getHostPrefs()).toMatchObject({ theme: "light", tts: { voiceURI: "v" } });
  });

  it("getCloseToTray and getLocale read through hostPrefs", () => {
    expect(getCloseToTray()).toBe(true);
    expect(getLocale()).toBe("zh-CN");
    saveDesktopPrefs({ theme: "system", debugToolsEnabled: false, closeToTray: false });
    saveGeneralPrefs({ locale: "en" });
    expect(getCloseToTray()).toBe(false);
    expect(getLocale()).toBe("en");
  });
});

describe("proxy env application", () => {
  const proxyEnvKeys = [
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
  ] as const;
  const savedEnv = { ...process.env };

  function clearProxyEnv() {
    for (const key of proxyEnvKeys) delete process.env[key];
  }

  afterEach(() => {
    for (const key of proxyEnvKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key] as string;
    }
  });

  it("saveDesktopPrefs with proxy writes proxy env vars", () => {
    clearProxyEnv();
    try {
      saveDesktopPrefs({
        theme: "system",
        debugToolsEnabled: false,
        closeToTray: true,
        proxy: { url: "http://127.0.0.1:7890", noProxy: "localhost" },
      });
      expect(process.env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
      expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
      expect(process.env.NO_PROXY).toBe("localhost");
    } finally {
      clearProxyEnv();
    }
  });

  it("saveDesktopPrefs without proxy leaves system proxy env untouched", () => {
    process.env.HTTPS_PROXY = "http://system-proxy:8080";
    process.env.http_proxy = "http://system-proxy:8080";
    try {
      saveDesktopPrefs({ theme: "system", debugToolsEnabled: false, closeToTray: true });
      expect(process.env.HTTPS_PROXY).toBe("http://system-proxy:8080");
      expect(process.env.http_proxy).toBe("http://system-proxy:8080");
    } finally {
      clearProxyEnv();
    }
  });

  it("applyProxyEnv clears proxy env vars when proxy is empty", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
    try {
      applyProxyEnv({});
      expect(process.env.HTTPS_PROXY).toBeUndefined();
    } finally {
      clearProxyEnv();
    }
  });

  it.each(["abc", "socks5://127.0.0.1:1080", "://missing-scheme", "http://"])(
    "applyProxyEnv ignores invalid proxy URL %s without throwing",
    (url) => {
      clearProxyEnv();
      try {
        expect(() => applyProxyEnv({ url })).not.toThrow();
        expect(process.env.HTTPS_PROXY).toBeUndefined();
        expect(process.env.HTTP_PROXY).toBeUndefined();
      } finally {
        clearProxyEnv();
      }
    },
  );

  it("saveDesktopPrefs re-sets the global dispatcher for hot-switch", () => {
    clearProxyEnv();
    setGlobalDispatcherMock.mockClear();
    try {
      saveDesktopPrefs({
        theme: "system",
        debugToolsEnabled: false,
        closeToTray: true,
        proxy: { url: "http://127.0.0.1:7890" },
      });
      expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
    } finally {
      clearProxyEnv();
    }
  });

  it("applyHostPrefsToEnv applies theme and proxy", () => {
    saveDesktopPrefs({
      theme: "dark",
      debugToolsEnabled: false,
      closeToTray: true,
      proxy: { url: "http://127.0.0.1:7890" },
    });
    delete process.env.HTTPS_PROXY;
    applyHostPrefsToEnv();
    expect(process.env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.https_proxy;
    delete process.env.http_proxy;
  });
});

describe("mobileAccess persistence", () => {
  it("getMobileAccess defaults mode to quick and other fields to empty", () => {
    expect(getMobileAccess()).toEqual({ enabled: false, token: undefined, mode: "quick", publicDomain: undefined });
  });

  it("setMobileAccess round-trips mode and publicDomain", () => {
    setMobileAccess({ enabled: true, token: "abc", mode: "manual", publicDomain: "https://spherse.example.com" });
    expect(getMobileAccess()).toEqual({
      enabled: true,
      token: "abc",
      mode: "manual",
      publicDomain: "https://spherse.example.com",
    });
  });

  it("setMobileAccess merges patch preserving untouched fields", () => {
    setMobileAccess({ enabled: true, token: "abc", mode: "manual", publicDomain: "https://a.com" });
    setMobileAccess({ publicDomain: "https://b.com" });
    expect(getMobileAccess()).toEqual({
      enabled: true,
      token: "abc",
      mode: "manual",
      publicDomain: "https://b.com",
    });
  });
});

describe("serverToken", () => {
  it("generates and persists when nothing exists", () => {
    settingsStore.set("serverToken", undefined);
    const token = getServerToken();
    expect(token).toBeTruthy();
    expect(settingsStore.get("serverToken")).toBe(token);
  });

  it("setServerToken overwrites and getServerToken returns it", () => {
    settingsStore.set("serverToken", "a");
    setServerToken("b");
    expect(getServerToken()).toBe("b");
  });

  it("generateAccessToken produces distinct secrets", () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken());
  });
});
