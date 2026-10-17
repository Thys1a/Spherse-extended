import { describe, expect, it, vi, beforeEach } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
  BrowserWindow: {},
}));

const { prefsStore, syncTray } = vi.hoisted(() => {
  const syncTray = vi.fn();
  return {
    prefsStore: {
      general: { locale: "zh-CN" },
      desktop: { theme: "system" as string, debugToolsEnabled: false, closeToTray: true },
    },
    syncTray,
  };
});

vi.mock("../settings.js", () => ({
  getGeneralPrefs: () => ({ ...prefsStore.general }),
  saveGeneralPrefs: (prefs: { locale: string }) => {
    prefsStore.general = { ...prefs };
  },
  getDesktopPrefs: () => ({ ...prefsStore.desktop }),
  saveDesktopPrefs: (prefs: typeof prefsStore.desktop) => {
    prefsStore.desktop = { ...prefs };
  },
}));

vi.mock("../tray.js", () => ({
  syncTray,
}));

import { registerHostPrefsIpc } from "./host-prefs.js";

beforeEach(() => {
  handlers.clear();
  syncTray.mockClear();
  registerHostPrefsIpc();
});

describe("host prefs ipc", () => {
  it("registers four channels", () => {
    expect([...handlers.keys()].sort()).toEqual([
      "get-desktop-prefs",
      "get-general-prefs",
      "save-desktop-prefs",
      "save-general-prefs",
    ]);
  });

  it("round-trips general prefs and syncs tray", () => {
    const save = handlers.get("save-general-prefs")!;
    expect(save(null, { locale: "en" })).toEqual({ success: true });
    expect(prefsStore.general).toEqual({ locale: "en" });
    expect(syncTray).toHaveBeenCalledTimes(1);

    const get = handlers.get("get-general-prefs")!;
    expect(get(null)).toEqual({ locale: "en" });
  });

  it("round-trips desktop prefs and syncs tray", () => {
    const save = handlers.get("save-desktop-prefs")!;
    expect(
      save(null, { theme: "dark", debugToolsEnabled: true, closeToTray: false }),
    ).toEqual({ success: true });
    expect(prefsStore.desktop).toEqual({ theme: "dark", debugToolsEnabled: true, closeToTray: false });
    expect(syncTray).toHaveBeenCalledTimes(1);
  });
});
