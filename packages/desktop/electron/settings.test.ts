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
  app: { isPackaged: false },
  nativeTheme: { themeSource: "system" },
}));

const { setGlobalDispatcherMock } = vi.hoisted(() => ({ setGlobalDispatcherMock: vi.fn() }));
vi.mock("undici", () => ({
  setGlobalDispatcher: setGlobalDispatcherMock,
  EnvHttpProxyAgent: class {},
}));

import { setGlobalDispatcher } from "undici";

import { maskModelGroup, mergeModelGroup, getMaskedSettings, saveSettings, settingsStore, getCloseToTray, getMobileAccess, setMobileAccess, getServerToken, setServerToken, generateAccessToken } from "./settings.js";
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

describe("closeToTray persistence", () => {
  const models = { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } };

  it("defaults closeToTray to true when absent", () => {
    settingsStore.set("settings", { locale: "zh-CN", models });
    expect(getMaskedSettings()?.closeToTray).toBe(true);
    expect(getCloseToTray()).toBe(true);
  });

  it("getCloseToTray defaults to true on fresh install", () => {
    settingsStore.set("settings", undefined);
    expect(getCloseToTray()).toBe(true);
  });

  it("saveSettings defaults closeToTray to true when not provided and no previous value", () => {
    settingsStore.set("settings", undefined);
    saveSettings({ locale: "zh-CN", models });
    expect(settingsStore.get("settings")?.closeToTray).toBe(true);
  });

  it("defaults closeToTray to false in an unpackaged dev run", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      settingsStore.set("settings", undefined);
      expect(getCloseToTray()).toBe(false);
      saveSettings({ locale: "zh-CN", models });
      expect(settingsStore.get("settings")?.closeToTray).toBe(false);
      expect(getMaskedSettings()?.closeToTray).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps an explicit closeToTray choice in an unpackaged dev run", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      settingsStore.set("settings", { locale: "zh-CN", closeToTray: true, models });
      expect(getCloseToTray()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("saveSettings preserves previous closeToTray when incoming omits it", () => {
    settingsStore.set("settings", { locale: "zh-CN", closeToTray: false, models });
    saveSettings({ locale: "zh-CN", models });
    expect(settingsStore.get("settings")?.closeToTray).toBe(false);
    expect(getMaskedSettings()?.closeToTray).toBe(false);
    expect(getCloseToTray()).toBe(false);
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

  it("saveSettings persists the sanitizeEmptySchemas flag on customProviders", () => {
    settingsStore.set("settings", undefined);
    const flagged = { ...customDef, sanitizeEmptySchemas: true };
    saveSettings({
      locale: "zh-CN",
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [flagged],
    });

    expect(settingsStore.get("settings")?.customProviders).toEqual([flagged]);
    expect(getMaskedSettings()?.customProviders).toEqual([flagged]);
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

describe("notification settings persistence", () => {
  const fullSettings = {
    locale: "zh-CN",
    models: {
      text: { defaultModel: "", providers: {} },
      image: { defaultModel: "", providers: {} },
    },
  };

  it("round-trips notification prefs through save and masked read", () => {
    saveSettings({ ...fullSettings, notifications: { approval: false } });
    expect(getMaskedSettings()?.notifications).toEqual({ approval: false });
  });

  it("preserves notification prefs across partial saves", () => {
    saveSettings({ ...fullSettings, notifications: { trigger: false } });
    saveSettings({ ...fullSettings });
    expect(getMaskedSettings()?.notifications).toEqual({ trigger: false });
  });
});

describe("provider API keys in process env", () => {
  const empty = { defaultModel: "", providers: {} };

  function saveTextKeys(providers: Record<string, { apiKey: string }>) {
    saveSettings({ locale: "zh-CN", models: { text: { defaultModel: "", providers }, image: empty } });
  }

  it("clears a provider env key after it is removed from settings", () => {
    settingsStore.set("settings", undefined);
    delete process.env.DEEPSEEK_API_KEY;
    saveTextKeys({ deepseek: { apiKey: "sk-live" } });
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-live");

    saveTextKeys({ deepseek: { apiKey: "" } });
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("restores a pre-existing shell env value when the settings key is removed", () => {
    settingsStore.set("settings", undefined);
    process.env.DEEPSEEK_API_KEY = "sk-from-shell";
    saveTextKeys({ deepseek: { apiKey: "sk-settings" } });
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-settings");

    saveTextKeys({});
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-from-shell");
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("keeps a shared env key while another provider still sets it", () => {
    settingsStore.set("settings", undefined);
    delete process.env.MOONSHOT_API_KEY;
    saveTextKeys({ moonshotai: { apiKey: "sk-a" }, "moonshotai-cn": { apiKey: "sk-b" } });
    saveTextKeys({ moonshotai: { apiKey: "" }, "moonshotai-cn": { apiKey: "sk-b****" } });
    expect(process.env.MOONSHOT_API_KEY).toBe("sk-b");
    saveTextKeys({});
    expect(process.env.MOONSHOT_API_KEY).toBeUndefined();
  });
});

describe("webSearch settings", () => {
  const empty = { defaultModel: "", providers: {} };

  function saveWebSearch(webSearch: { apiKey?: string; baseUrl?: string; model?: string }) {
    saveSettings({ locale: "zh-CN", models: { text: empty, image: empty }, webSearch });
  }

  function clearSearchEnv() {
    delete process.env.SPHERSE_WEB_SEARCH_API_KEY;
    delete process.env.SPHERSE_WEB_SEARCH_BASE_URL;
    delete process.env.SPHERSE_WEB_SEARCH_MODEL;
  }

  it("round-trips the section through save and masked read", () => {
    settingsStore.set("settings", undefined);
    clearSearchEnv();
    saveWebSearch({ apiKey: "sk-live-key", baseUrl: "https://gateway.test/anthropic", model: "custom/search-1" });
    expect(getMaskedSettings()?.webSearch).toEqual({
      apiKey: "sk-l****-key",
      baseUrl: "https://gateway.test/anthropic",
      model: "custom/search-1",
    });
    expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBe("sk-live-key");
    expect(process.env.SPHERSE_WEB_SEARCH_BASE_URL).toBe("https://gateway.test/anthropic");
    expect(process.env.SPHERSE_WEB_SEARCH_MODEL).toBe("custom/search-1");
    clearSearchEnv();
  });

  it("keeps the previous key when the incoming key is masked", () => {
    settingsStore.set("settings", undefined);
    clearSearchEnv();
    saveWebSearch({ apiKey: "sk-live-key" });
    saveWebSearch({ apiKey: "sk-l****-key", model: "custom/search-1" });
    expect(settingsStore.get("settings")?.webSearch).toEqual({ apiKey: "sk-live-key", model: "custom/search-1" });
    expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBe("sk-live-key");
    clearSearchEnv();
  });

  it("clears the key and env when the incoming key is blank", () => {
    settingsStore.set("settings", undefined);
    clearSearchEnv();
    saveWebSearch({ apiKey: "sk-live-key" });
    saveWebSearch({ apiKey: "" });
    expect(settingsStore.get("settings")?.webSearch?.apiKey).toBeUndefined();
    expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBeUndefined();
  });

  it("deletes fields absent from a present section", () => {
    settingsStore.set("settings", undefined);
    clearSearchEnv();
    saveWebSearch({ apiKey: "sk-live-key", baseUrl: "https://gateway.test/anthropic", model: "custom/search-1" });
    saveWebSearch({ model: "custom/search-2" });
    expect(settingsStore.get("settings")?.webSearch).toEqual({ model: "custom/search-2" });
    expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBeUndefined();
    expect(process.env.SPHERSE_WEB_SEARCH_BASE_URL).toBeUndefined();
    expect(process.env.SPHERSE_WEB_SEARCH_MODEL).toBe("custom/search-2");
    clearSearchEnv();
  });

  it("preserves the section across partial saves without it", () => {
    settingsStore.set("settings", undefined);
    clearSearchEnv();
    saveWebSearch({ apiKey: "sk-live-key" });
    saveSettings({ locale: "zh-CN", models: { text: empty, image: empty } });
    expect(settingsStore.get("settings")?.webSearch?.apiKey).toBe("sk-live-key");
    expect(process.env.SPHERSE_WEB_SEARCH_API_KEY).toBe("sk-live-key");
    clearSearchEnv();
  });
});
