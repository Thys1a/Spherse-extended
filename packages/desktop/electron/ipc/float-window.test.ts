import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const { floatMock, settingsMock, mainWin } = vi.hoisted(() => ({
  floatMock: {
    openFloatWindow: vi.fn(),
    closeFloatWindowByWebContents: vi.fn(),
    listFloatKeys: vi.fn((): string[] => []),
  },
  settingsMock: {
    openProjects: [] as Array<{ id: string; path: string; name: string; lastOpened: string }>,
  },
  mainWin: {
    destroyed: false,
    minimized: false,
    visible: true,
    focused: false,
    restored: false,
    shown: false,
    sent: [] as Array<{ channel: string; payload: unknown }>,
  },
}));

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
}));

vi.mock("@spherse/core", () => ({
  isPathInside: (root: string, target: string) => {
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
    const r = norm(root);
    const t = norm(target);
    return t === r || t.startsWith(`${r}/`);
  },
}));

vi.mock("../settings.js", () => ({
  getOpenProjects: () => settingsMock.openProjects,
}));

vi.mock("../float-window.js", () => ({
  closeFloatWindowByWebContents: floatMock.closeFloatWindowByWebContents,
  listFloatKeys: floatMock.listFloatKeys,
  openFloatWindow: floatMock.openFloatWindow,
  FLOAT_WINDOW_NAVIGATE_CHANNEL: "float-window:navigate-main",
}));

vi.mock("../window.js", () => ({
  getMainWindow: () => ({
    isDestroyed: () => mainWin.destroyed,
    isMinimized: () => mainWin.minimized,
    isVisible: () => mainWin.visible,
    restore: () => {
      mainWin.restored = true;
    },
    show: () => {
      mainWin.shown = true;
    },
    focus: () => {
      mainWin.focused = true;
    },
    webContents: {
      send: (channel: string, payload: unknown) => {
        mainWin.sent.push({ channel, payload });
      },
    },
  }),
}));

import { registerFloatWindowIpc } from "./float-window.js";

registerFloatWindowIpc();

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler registered for ${channel}`);
  return Promise.resolve(fn({ sender: {} }, ...args));
}

beforeEach(() => {
  handlers.clear();
  floatMock.openFloatWindow.mockReset();
  floatMock.closeFloatWindowByWebContents.mockReset();
  floatMock.listFloatKeys.mockReset();
  floatMock.listFloatKeys.mockReturnValue([]);
  floatMock.openFloatWindow.mockReturnValue({ id: "win" });
  floatMock.closeFloatWindowByWebContents.mockReturnValue(true);
  settingsMock.openProjects = [
    { id: "p1", path: "/proj", name: "proj", lastOpened: "2026-01-01T00:00:00.000Z" },
  ];
  mainWin.destroyed = false;
  mainWin.minimized = false;
  mainWin.visible = true;
  mainWin.focused = false;
  mainWin.restored = false;
  mainWin.shown = false;
  mainWin.sent = [];
  registerFloatWindowIpc();
});

describe("float-window:open", () => {
  it("opens a float window for a registered project", async () => {
    await expect(
      invoke("float-window:open", { kind: "chat", projectId: "p1", itemKey: "s1" }),
    ).resolves.toEqual({ ok: true });
    expect(floatMock.openFloatWindow).toHaveBeenCalledWith({
      kind: "chat",
      projectId: "p1",
      itemKey: "s1",
    });
  });

  it("rejects unknown projects", async () => {
    await expect(
      invoke("float-window:open", { kind: "chat", projectId: "nope", itemKey: "s1" }),
    ).resolves.toBeNull();
    expect(floatMock.openFloatWindow).not.toHaveBeenCalled();
  });

  it("rejects content paths outside the project", async () => {
    const outsideAbsolute = path.resolve("/proj", "..", "escape.md");
    await expect(
      invoke("float-window:open", { kind: "content", projectId: "p1", itemKey: outsideAbsolute }),
    ).resolves.toBeNull();
    await expect(
      invoke("float-window:open", { kind: "content", projectId: "p1", itemKey: "../escape.md" }),
    ).resolves.toBeNull();
    expect(floatMock.openFloatWindow).not.toHaveBeenCalled();
  });

  it("accepts project-relative content paths", async () => {
    await expect(
      invoke("float-window:open", { kind: "content", projectId: "p1", itemKey: "docs/a.md" }),
    ).resolves.toEqual({ ok: true });
    expect(floatMock.openFloatWindow).toHaveBeenCalledWith({
      kind: "content",
      projectId: "p1",
      itemKey: "docs/a.md",
    });
  });

  it("rejects unknown kinds and empty item keys", async () => {
    await expect(
      invoke("float-window:open", { kind: "video", projectId: "p1", itemKey: "s1" }),
    ).resolves.toBeNull();
    await expect(
      invoke("float-window:open", { kind: "chat", projectId: "p1", itemKey: "" }),
    ).resolves.toBeNull();
    expect(floatMock.openFloatWindow).not.toHaveBeenCalled();
  });
});

describe("float-window:close-self", () => {
  it("closes the sender window with dock/forget flags", async () => {
    await expect(
      invoke("float-window:close-self", { dock: true }),
    ).resolves.toBe(true);
    expect(floatMock.closeFloatWindowByWebContents).toHaveBeenCalledWith(
      expect.anything(),
      { forget: false, dock: true },
    );
  });
});

describe("float-window:navigate-main", () => {
  it("focuses main and forwards the route", async () => {
    await expect(invoke("float-window:navigate-main", "/project/p1")).resolves.toBe(true);
    expect(mainWin.focused).toBe(true);
    expect(mainWin.sent).toEqual([
      { channel: "float-window:navigate-main", payload: { route: "/project/p1" } },
    ]);
  });

  it("rejects non-absolute routes", async () => {
    await expect(invoke("float-window:navigate-main", "https://evil.example")).resolves.toBe(false);
    expect(mainWin.sent).toHaveLength(0);
  });

  it("restores and shows a hidden main window", async () => {
    mainWin.minimized = true;
    mainWin.visible = false;
    await expect(invoke("float-window:navigate-main", "/project/p1")).resolves.toBe(true);
    expect(mainWin.restored).toBe(true);
    expect(mainWin.shown).toBe(true);
  });

  it("returns false when the main window is gone", async () => {
    mainWin.destroyed = true;
    await expect(invoke("float-window:navigate-main", "/project/p1")).resolves.toBe(false);
  });
});

describe("float-window:list", () => {
  it("returns live float window keys", async () => {
    floatMock.listFloatKeys.mockReturnValue(["chat:p1:s1"]);
    await expect(invoke("float-window:list")).resolves.toEqual(["chat:p1:s1"]);
  });
});
