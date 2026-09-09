import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {};
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
  },
}));

vi.mock("electron", () => ({
  nativeTheme: { themeSource: "system" },
}));

const { setGlobalDispatcherMock } = vi.hoisted(() => ({ setGlobalDispatcherMock: vi.fn() }));
vi.mock("undici", () => ({
  setGlobalDispatcher: setGlobalDispatcherMock,
  EnvHttpProxyAgent: class {},
}));

import { setGlobalDispatcher } from "undici";

import { maskModelGroup, mergeModelGroup, getMaskedSettings, saveSettings, settingsStore, getMobileAccess, setMobileAccess, getServerToken, setServerToken, generateAccessToken } from "./settings.js";
import { getAppModelCatalog } from "./model-catalog.js";

describe("mergeModelGroup sampling passthrough", () => {
  it("uses incoming sampling when present", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {}, sampling: { temperature: 0.7, topP: 0.9 } },
      { defaultModel: "", providers: {}, sampling: { temperature: 0.3, topP: 0.1 } },
    );

    expect(result.sampling).toEqual({ temperature: 0.7, topP: 0.9 });
  });

  it("does not fall back to prev when incoming has no sampling", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {} },
      { defaultModel: "", providers: {}, sampling: { temperature: 0.3 } },
    );

    expect(result.sampling).toBeUndefined();
  });

  it("is undefined when neither has sampling", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {} },
      { defaultModel: "", providers: {} },
    );

    expect(result.sampling).toBeUndefined();
  });

  it("clears sampling when incoming is explicitly undefined", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {}, sampling: undefined },
      { defaultModel: "", providers: {}, sampling: { temperature: 0.5 } },
    );

    expect(result.sampling).toBeUndefined();
  });
});

describe("maskModelGroup sampling passthrough", () => {
  it("preserves sampling without masking", () => {
    const result = maskModelGroup({
      defaultModel: "deepseek/v4",
      providers: { deepseek: { apiKey: "sk-secret-key-12345" } },
      sampling: { temperature: 0.4, topP: 0.5 },
    });

    expect(result.sampling).toEqual({ temperature: 0.4, topP: 0.5 });
    expect(result.providers.deepseek?.apiKey).toBe("sk-s****2345");
  });

  it("passes through undefined sampling", () => {
    const result = maskModelGroup({ defaultModel: "", providers: {} });

    expect(result.sampling).toBeUndefined();
  });
});

describe("thinkingLevel persistence", () => {
  it("mergeModelGroup uses incoming thinkingLevel when present", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {}, thinkingLevel: "high" },
      { defaultModel: "", providers: {}, thinkingLevel: "low" },
    );

    expect(result.thinkingLevel).toBe("high");
  });

  it("mergeModelGroup does not fall back to prev when incoming omits thinkingLevel", () => {
    const result = mergeModelGroup(
      { defaultModel: "deepseek/v4", providers: {} },
      { defaultModel: "", providers: {}, thinkingLevel: "low" },
    );

    expect(result.thinkingLevel).toBeUndefined();
  });

  it("maskModelGroup preserves thinkingLevel", () => {
    const result = maskModelGroup({
      defaultModel: "deepseek/v4",
      providers: {},
      thinkingLevel: "off",
    });

    expect(result.thinkingLevel).toBe("off");
  });

  it("getMaskedSettings returns stored thinkingLevel for text group", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      models: {
        text: { defaultModel: "", providers: {}, thinkingLevel: "high" },
        image: { defaultModel: "", providers: {} },
      },
    });

    expect(getMaskedSettings()?.models.text.thinkingLevel).toBe("high");
  });

  it("saveSettings round-trips thinkingLevel through merge", () => {
    settingsStore.set("settings", undefined);
    saveSettings({
      locale: "zh-CN",
      models: {
        text: { defaultModel: "", providers: {}, thinkingLevel: "low" },
        image: { defaultModel: "", providers: {} },
      },
    });

    expect(settingsStore.get("settings")?.models.text.thinkingLevel).toBe("low");
  });
});

describe("theme persistence", () => {
  it("getMaskedSettings defaults theme to system when absent", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    const masked = getMaskedSettings();

    expect(masked?.theme).toBe("system");
  });

  it("getMaskedSettings returns stored theme", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      theme: "dark",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    expect(getMaskedSettings()?.theme).toBe("dark");
  });

  it("saveSettings defaults theme to system when not provided and no previous value", () => {
    settingsStore.set("settings", undefined);
    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    expect(settingsStore.get("settings")?.theme).toBe("system");
  });

  it("saveSettings preserves previous theme when incoming omits it", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      theme: "light",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    expect(settingsStore.get("settings")?.theme).toBe("light");
  });
});

describe("customProviders persistence", () => {
  const customDef = {
    id: "my-openai",
    name: "My OpenAI",
    baseUrl: "https://api.example.com/v1",
    models: ["gpt-4o"],
    keyless: false,
  };

  it("saveSettings persists incoming customProviders", () => {
    settingsStore.set("settings", undefined);
    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [customDef],
    });

    expect(settingsStore.get("settings")?.customProviders).toEqual([customDef]);
  });

  it("saveSettings preserves previous customProviders when incoming omits them", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      customProviders: [customDef],
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    expect(settingsStore.get("settings")?.customProviders).toEqual([customDef]);
  });

  it("saveSettings replaces customProviders wholesale when provided", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      customProviders: [customDef],
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    const updated = { ...customDef, name: "Renamed" };
    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [updated],
    });

    expect(settingsStore.get("settings")?.customProviders).toEqual([updated]);
  });

  it("getMaskedSettings passes through customProviders unchanged", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      customProviders: [customDef],
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    const masked = getMaskedSettings();

    expect(masked?.customProviders).toEqual([customDef]);
  });

  it("getMaskedSettings defaults customProviders to empty array when absent", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    const masked = getMaskedSettings();

    expect(masked?.customProviders).toEqual([]);
  });

  it("saveSettings registers custom providers into the core catalog via syncCustomProviders", () => {
    settingsStore.set("settings", undefined);
    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [customDef],
    });

    const catalog = getAppModelCatalog().getSupportedProviders();
    expect(catalog["my-openai"]).toBeDefined();
    expect(catalog["my-openai"].custom).toBe(true);
    expect(catalog["my-openai"].baseUrl).toBe("https://api.example.com/v1");

    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [],
    });
    expect(getAppModelCatalog().getSupportedProviders()["my-openai"]).toBeUndefined();
  });
});

describe("mobileAccess persistence", () => {
  it("getMobileAccess defaults mode to quick and other fields to empty", () => {
    settingsStore.set("settings", undefined);
    expect(getMobileAccess()).toEqual({ enabled: false, token: undefined, mode: "quick", publicDomain: undefined });
  });

  it("setMobileAccess round-trips mode and publicDomain", () => {
    settingsStore.set("settings", undefined);
    setMobileAccess({ enabled: true, token: "abc", mode: "manual", publicDomain: "https://spherse.example.com" });
    expect(getMobileAccess()).toEqual({
      enabled: true,
      token: "abc",
      mode: "manual",
      publicDomain: "https://spherse.example.com",
    });
  });

  it("setMobileAccess merges patch preserving untouched fields", () => {
    settingsStore.set("settings", undefined);
    setMobileAccess({ enabled: true, token: "abc", mode: "manual", publicDomain: "https://a.com" });
    setMobileAccess({ publicDomain: "https://b.com" });
    expect(getMobileAccess()).toEqual({
      enabled: true,
      token: "abc",
      mode: "manual",
      publicDomain: "https://b.com",
    });
  });

  it("saveSettings preserves existing mobileAccess (regression)", () => {
    settingsStore.set("settings", {
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      mobileAccess: { enabled: true, token: "tok", mode: "manual", publicDomain: "https://x.com" },
    });

    saveSettings({
      locale: "en",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });

    expect(settingsStore.get("settings")?.mobileAccess).toEqual({
      enabled: true,
      token: "tok",
      mode: "manual",
      publicDomain: "https://x.com",
    });
  });
});

describe("proxy persistence", () => {
  const proxyEnvKeys = ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"] as const;
  const savedEnv = { ...process.env };

  function clearProxyEnv() {
    for (const key of proxyEnvKeys) delete process.env[key];
  }

  function baseSettings() {
    return {
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    };
  }

  it("saveSettings persists incoming proxy", () => {
    settingsStore.set("settings", undefined);
    clearProxyEnv();
    try {
      saveSettings({ ...baseSettings(), proxy: { url: "http://127.0.0.1:7890", noProxy: "localhost" } });
      expect(settingsStore.get("settings")?.proxy).toEqual({ url: "http://127.0.0.1:7890", noProxy: "localhost" });
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings falls back to prev proxy when incoming omits it", () => {
    settingsStore.set("settings", { ...baseSettings(), proxy: { url: "http://127.0.0.1:7890" } });
    clearProxyEnv();
    try {
      saveSettings({ ...baseSettings(), locale: "en" });
      expect(settingsStore.get("settings")?.proxy).toEqual({ url: "http://127.0.0.1:7890" });
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings writes proxy env vars", () => {
    settingsStore.set("settings", undefined);
    clearProxyEnv();
    try {
      saveSettings({ ...baseSettings(), proxy: { url: "http://127.0.0.1:7890", noProxy: "localhost" } });
      expect(process.env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
      expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
      expect(process.env.NO_PROXY).toBe("localhost");
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings clears proxy env vars when proxy is empty", () => {
    settingsStore.set("settings", undefined);
    process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
    process.env.HTTP_PROXY = "http://127.0.0.1:7890";
    process.env.NO_PROXY = "localhost";
    try {
      saveSettings({ ...baseSettings(), proxy: {} });
      expect(process.env.HTTPS_PROXY).toBeUndefined();
      expect(process.env.HTTP_PROXY).toBeUndefined();
      expect(process.env.NO_PROXY).toBeUndefined();
    } finally {
      for (const key of proxyEnvKeys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key] as string;
      }
    }
  });

  it("getMaskedSettings passes proxy through", () => {
    settingsStore.set("settings", { ...baseSettings(), proxy: { url: "http://127.0.0.1:7890" } });
    clearProxyEnv();
    try {
      expect(getMaskedSettings()?.proxy).toEqual({ url: "http://127.0.0.1:7890" });
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings writes lowercase proxy env vars too", () => {
    settingsStore.set("settings", undefined);
    clearProxyEnv();
    try {
      saveSettings({ ...baseSettings(), proxy: { url: "http://127.0.0.1:7890", noProxy: "localhost" } });
      expect(process.env.https_proxy).toBe("http://127.0.0.1:7890");
      expect(process.env.http_proxy).toBe("http://127.0.0.1:7890");
      expect(process.env.no_proxy).toBe("localhost");
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings clears lowercase proxy env vars when proxy is empty", () => {
    settingsStore.set("settings", undefined);
    const savedLower = {
      https_proxy: process.env.https_proxy,
      http_proxy: process.env.http_proxy,
      no_proxy: process.env.no_proxy,
    };
    process.env.https_proxy = "http://127.0.0.1:7890";
    process.env.http_proxy = "http://127.0.0.1:7890";
    process.env.no_proxy = "localhost";
    try {
      saveSettings({ ...baseSettings(), proxy: {} });
      expect(process.env.https_proxy).toBeUndefined();
      expect(process.env.http_proxy).toBeUndefined();
      expect(process.env.no_proxy).toBeUndefined();
    } finally {
      for (const key of proxyEnvKeys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key] as string;
      }
      for (const key of Object.keys(savedLower) as (keyof typeof savedLower)[]) {
        if (savedLower[key] === undefined) delete process.env[key];
        else process.env[key] = savedLower[key] as string;
      }
    }
  });

  it.each(["abc", "socks5://127.0.0.1:1080", "://missing-scheme", "http://"])(
    "saveSettings ignores invalid proxy URL %s without throwing",
    (url) => {
      settingsStore.set("settings", undefined);
      clearProxyEnv();
      try {
        expect(() => saveSettings({ ...baseSettings(), proxy: { url } })).not.toThrow();
        expect(process.env.HTTPS_PROXY).toBeUndefined();
        expect(process.env.HTTP_PROXY).toBeUndefined();
        expect(process.env.https_proxy).toBeUndefined();
        expect(process.env.http_proxy).toBeUndefined();
      } finally {
        clearProxyEnv();
      }
    },
  );

  it("saveSettings leaves system proxy env untouched when proxy is unconfigured", () => {
    settingsStore.set("settings", { ...baseSettings() });
    process.env.HTTPS_PROXY = "http://system-proxy:8080";
    process.env.http_proxy = "http://system-proxy:8080";
    try {
      saveSettings({ ...baseSettings(), locale: "en" });
      expect(process.env.HTTPS_PROXY).toBe("http://system-proxy:8080");
      expect(process.env.http_proxy).toBe("http://system-proxy:8080");
    } finally {
      clearProxyEnv();
    }
  });

  it("saveSettings re-sets the global dispatcher for hot-switch", () => {
    settingsStore.set("settings", undefined);
    clearProxyEnv();
    setGlobalDispatcherMock.mockClear();
    try {
      saveSettings({ ...baseSettings(), proxy: { url: "http://127.0.0.1:7890" } });
      expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
    } finally {
      clearProxyEnv();
    }
  });
});

describe("serverToken", () => {
  it("generates and persists when nothing exists", () => {
    settingsStore.set("settings", undefined);
    settingsStore.set("serverToken", undefined);
    const token = getServerToken();
    expect(token).toBeTruthy();
    expect(settingsStore.get("serverToken")).toBe(token);
  });

  it("migrates from legacy mobileAccess.token", () => {
    settingsStore.set("settings", { mobileAccess: { enabled: true, token: "legacy-tok", mode: "quick" } });
    settingsStore.set("serverToken", undefined);
    expect(getServerToken()).toBe("legacy-tok");
    expect(settingsStore.get("serverToken")).toBe("legacy-tok");
  });

  it("prefers existing serverToken over legacy token", () => {
    settingsStore.set("settings", { mobileAccess: { enabled: true, token: "legacy-tok", mode: "quick" } });
    settingsStore.set("serverToken", "current-tok");
    expect(getServerToken()).toBe("current-tok");
  });

  it("setServerToken overwrites and getServerToken returns it", () => {
    settingsStore.set("serverToken", "a");
    setServerToken("b");
    expect(getServerToken()).toBe("b");
  });

  it("saveSettings does not drop serverToken (top-level key)", () => {
    settingsStore.set("serverToken", "keep-me");
    settingsStore.set("settings", undefined);
    saveSettings({
      locale: "en",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
    });
    expect(settingsStore.get("serverToken")).toBe("keep-me");
  });

  it("generateAccessToken produces distinct secrets", () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken());
  });
});
