import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../lib/host-bridge";
import { createMockHostBridge } from "../test/host-bridge";
import { useSettingsStore } from "./settings-store";

function createBridge(prefs: Record<string, unknown> = {}, desktop: Record<string, unknown> = {}): HostBridge {
  const bridge = createMockHostBridge();
  return {
    ...bridge,
    prefs: {
      getPrefs: vi.fn(async () => ({ locale: "zh-CN", ...prefs })),
      savePrefs: vi.fn(async () => true),
    },
    desktopPrefs: {
      getPrefs: vi.fn(async () => ({
        theme: "system",
        debugToolsEnabled: false,
        closeToTray: true,
        ...desktop,
      })),
      savePrefs: vi.fn(async () => true),
    },
  } as unknown as HostBridge;
}

beforeEach(() => {
  useSettingsStore.setState({
    loaded: false,
    locale: "zh-CN",
    debugToolsEnabled: false,
    closeToTray: true,
    theme: "system",
    tts: {},
    proxy: {},
    notifications: {},
  });
});

describe("useSettingsStore prefs", () => {
  it("loads locale and desktop prefs from the bridge", async () => {
    const bridge = createBridge({ locale: "en" }, { theme: "dark", debugToolsEnabled: true, closeToTray: false });

    await useSettingsStore.getState().loadPrefs(bridge);

    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.locale).toBe("en");
    expect(state.theme).toBe("dark");
    expect(state.debugToolsEnabled).toBe(true);
    expect(state.closeToTray).toBe(false);
  });

  it("falls back to defaults when the bridge has no desktop prefs", async () => {
    const bridge = createMockHostBridge();
    const webBridge = { ...bridge, desktopPrefs: undefined };

    await useSettingsStore.getState().loadPrefs(webBridge);

    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.theme).toBe("system");
    expect(state.debugToolsEnabled).toBe(false);
  });

  it("changeLocale persists through prefs", async () => {
    const bridge = createBridge();
    await useSettingsStore.getState().loadPrefs(bridge);

    const ok = await useSettingsStore.getState().changeLocale(bridge, "en");

    expect(ok).toBe(true);
    expect(useSettingsStore.getState().locale).toBe("en");
    expect(bridge.prefs.savePrefs).toHaveBeenCalledWith({ locale: "en" });
  });

  it("desktop setters persist the full desktop object", async () => {
    const bridge = createBridge();
    await useSettingsStore.getState().loadPrefs(bridge);

    await useSettingsStore.getState().setTheme(bridge, "dark");
    expect(bridge.desktopPrefs!.savePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dark", debugToolsEnabled: false, closeToTray: true }),
    );

    await useSettingsStore.getState().setTts(bridge, { autoRead: true });
    expect(bridge.desktopPrefs!.savePrefs).toHaveBeenLastCalledWith(expect.objectContaining({ tts: { autoRead: true } }));

    await useSettingsStore.getState().setProxy(bridge, { url: "http://127.0.0.1:7890" });
    expect(bridge.desktopPrefs!.savePrefs).toHaveBeenLastCalledWith(
      expect.objectContaining({ proxy: { url: "http://127.0.0.1:7890" } }),
    );

    await useSettingsStore.getState().setNotifications(bridge, { trigger: false });
    expect(bridge.desktopPrefs!.savePrefs).toHaveBeenLastCalledWith(
      expect.objectContaining({ notifications: { trigger: false } }),
    );
  });

  it("desktop setters return false without desktop prefs", async () => {
    const bridge = createMockHostBridge();
    const webBridge = { ...bridge, desktopPrefs: undefined };

    expect(await useSettingsStore.getState().setTheme(webBridge, "dark")).toBe(false);
    expect(useSettingsStore.getState().theme).toBe("dark");
  });
});
