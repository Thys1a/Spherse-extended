import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, shown } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  shown: [] as Array<{ title: string; body: string; click: () => void }>,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
  Notification: class {
    private clickHandler: (() => void) | null = null;
    constructor(private readonly opts: { title: string; body: string }) {}
    on(event: string, fn: () => void) {
      if (event === "click") this.clickHandler = fn;
    }
    show() {
      shown.push({ ...this.opts, click: () => this.clickHandler?.() });
    }
  },
  BrowserWindow: {},
}));

import { registerNotificationIpc } from "./notifications.js";

describe("registerNotificationIpc", () => {
  const focus = vi.fn();
  const restore = vi.fn();
  let minimized = false;
  const getWindow = vi.fn(() => ({
    isMinimized: () => minimized,
    restore,
    focus,
  })) as unknown as () => Electron.BrowserWindow | null;

  beforeEach(() => {
    handlers.clear();
    shown.length = 0;
    minimized = false;
    vi.clearAllMocks();
    registerNotificationIpc(getWindow);
  });

  function invoke(title: string, body: string) {
    const handler = handlers.get("show-notification");
    expect(handler).toBeDefined();
    return (handler as (event: unknown, opts: { title: string; body: string }) => void)(
      {},
      { title, body },
    );
  }

  it("shows an OS notification with the given title and body", () => {
    invoke("Agent", "waiting for approval");
    expect(shown).toEqual([{ title: "Agent", body: "waiting for approval", click: expect.any(Function) }]);
  });

  it("focuses the main window on click", () => {
    invoke("Agent", "done");
    shown[0].click();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores a minimized window before focusing", () => {
    minimized = true;
    invoke("Agent", "done");
    shown[0].click();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
