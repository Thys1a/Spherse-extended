import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

const { fromWebContentsMock, mainWin, senderWin } = vi.hoisted(() => {
  function makeWin() {
    return {
      webContents: {
        devToolsOpened: false,
        isDevToolsOpened(this: { devToolsOpened: boolean }) {
          return this.devToolsOpened;
        },
        openDevTools: vi.fn(),
        closeDevTools: vi.fn(),
        reload: vi.fn(),
      },
    };
  }
  return {
    fromWebContentsMock: vi.fn((): unknown => null),
    mainWin: makeWin(),
    senderWin: makeWin(),
  };
});

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
  },
}));

vi.mock("../settings.js", () => ({
  settingsStore: { store: {}, clear: vi.fn() },
}));

import { registerDebugIpc } from "./debug.js";

registerDebugIpc(() => mainWin as unknown as BrowserWindow);

function invokeWithEvent(event: unknown, channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler registered for ${channel}`);
  return fn(event, ...args);
}

beforeEach(() => {
  handlers.clear();
  fromWebContentsMock.mockReset();
  fromWebContentsMock.mockReturnValue(null);
  for (const win of [mainWin, senderWin]) {
    win.webContents.devToolsOpened = false;
    win.webContents.openDevTools.mockClear();
    win.webContents.closeDevTools.mockClear();
    win.webContents.reload.mockClear();
  }
  registerDebugIpc(() => mainWin as unknown as BrowserWindow);
});

describe("sender-scoped devtools", () => {
  it("toggles devtools on the sender window", () => {
    fromWebContentsMock.mockReturnValue(senderWin);
    invokeWithEvent({ sender: {} }, "toggle-dev-tools");
    expect(senderWin.webContents.openDevTools).toHaveBeenCalledTimes(1);
    expect(mainWin.webContents.openDevTools).not.toHaveBeenCalled();
  });

  it("closes devtools on the sender window when already open", () => {
    senderWin.webContents.devToolsOpened = true;
    fromWebContentsMock.mockReturnValue(senderWin);
    invokeWithEvent({ sender: {} }, "toggle-dev-tools");
    expect(senderWin.webContents.closeDevTools).toHaveBeenCalledTimes(1);
  });

  it("falls back to the main window when the sender has no window", () => {
    fromWebContentsMock.mockReturnValue(null);
    invokeWithEvent({ sender: {} }, "toggle-dev-tools");
    expect(mainWin.webContents.openDevTools).toHaveBeenCalledTimes(1);
  });

  it("reports devtools state of the sender window", () => {
    senderWin.webContents.devToolsOpened = true;
    fromWebContentsMock.mockReturnValue(senderWin);
    expect(invokeWithEvent({ sender: {} }, "is-dev-tools-open")).toBe(true);
    expect(invokeWithEvent(undefined, "is-dev-tools-open")).toBe(false);
  });

  it("reloads the sender window", () => {
    fromWebContentsMock.mockReturnValue(senderWin);
    invokeWithEvent({ sender: {} }, "reload-renderer");
    expect(senderWin.webContents.reload).toHaveBeenCalledTimes(1);
    expect(mainWin.webContents.reload).not.toHaveBeenCalled();
  });
});
