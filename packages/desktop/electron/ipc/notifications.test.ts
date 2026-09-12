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

import { NOTIFICATION_CLICK_CHANNEL, registerNotificationIpc } from "./notifications.js";

describe("registerNotificationIpc", () => {
  const focus = vi.fn();
  const restore = vi.fn();
  const send = vi.fn();
  let minimized = false;
  let windowNull = false;
  const getWindow = vi.fn(() => {
    if (windowNull) return null;
    return {
      isMinimized: () => minimized,
      restore,
      focus,
      webContents: { send },
    };
  }) as unknown as () => Electron.BrowserWindow | null;

  beforeEach(() => {
    handlers.clear();
    shown.length = 0;
    minimized = false;
    windowNull = false;
    vi.clearAllMocks();
    registerNotificationIpc(getWindow);
  });

  function invoke(opts: unknown) {
    const handler = handlers.get("show-notification");
    expect(handler).toBeDefined();
    return (handler as (event: unknown, payload: unknown) => void)({}, opts);
  }

  it("shows an OS notification with the given title and body", () => {
    invoke({ title: "Agent", body: "waiting for approval" });
    expect(shown).toEqual([{ title: "Agent", body: "waiting for approval", click: expect.any(Function) }]);
  });

  it("focuses the main window on click", () => {
    invoke({ title: "Agent", body: "done" });
    shown[0].click();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores a minimized window before focusing", () => {
    minimized = true;
    invoke({ title: "Agent", body: "done" });
    shown[0].click();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("forwards the route to the renderer on click", () => {
    invoke({ title: "Agent", body: "done", route: "/project/p1/chat/s1" });
    shown[0].click();
    expect(send).toHaveBeenCalledWith(NOTIFICATION_CLICK_CHANNEL, { route: "/project/p1/chat/s1" });
  });

  it("does nothing on click when the window is gone", () => {
    windowNull = true;
    invoke({ title: "Agent", body: "done", route: "/project/p1/chat/s1" });
    expect(() => shown[0].click()).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("normalizes non-string input and caps lengths without throwing", () => {
    invoke({ title: 42, body: "x".repeat(2000), route: 7 });
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("42");
    expect(shown[0].body).toHaveLength(500);
    expect(() => shown[0].click()).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
