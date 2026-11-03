import { beforeEach, describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import type { FloatWindowRecord } from "./settings.js";

const state = vi.hoisted(() => ({
  records: {} as Record<string, FloatWindowRecord>,
  quitting: false,
  mainSent: [] as Array<{ channel: string; payload: unknown }>,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  windows: [] as Array<{
    options: Record<string, unknown>;
    bounds: { x: number; y: number; width: number; height: number };
    destroyed: boolean;
    handlers: Map<string, Array<(...args: never[]) => void>>;
    webContents: { sent: Array<{ channel: string; payload: unknown }> };
    on: (event: string, handler: (...args: never[]) => void) => void;
    emit: (event: string, ...args: never[]) => void;
    loadURL: (...args: unknown[]) => void;
    loadFile: (...args: unknown[]) => void;
    focus: (...args: unknown[]) => void;
    setAlwaysOnTop: (...args: unknown[]) => void;
    setWindowOpenHandler: (...args: unknown[]) => void;
    isDestroyed: () => boolean;
    getBounds: () => { x: number; y: number; width: number; height: number };
    close: () => void;
    destroy: () => void;
  }>,
  rendererLoad: { type: "file", file: "/renderer/index.html" } as
    | { type: "url"; url: string }
    | { type: "file"; file: string },
}));

vi.mock("electron", () => {
  class MockWindow {
    options: Record<string, unknown>;
    bounds = { x: 0, y: 0, width: 400, height: 300 };
    destroyed = false;
    handlers = new Map<string, Array<(...args: never[]) => void>>();
    webContents = {
      sent: [] as Array<{ channel: string; payload: unknown }>,
      send(channel: string, payload: unknown) {
        this.sent.push({ channel, payload });
      },
      on() {},
      setWindowOpenHandler() {},
    };
    loadURL = vi.fn();
    loadFile = vi.fn();
    focus = vi.fn();
    setAlwaysOnTop = vi.fn();
    setWindowOpenHandler = vi.fn();
    constructor(options: Record<string, unknown>) {
      state.windows.push(this as unknown as MockWindow);
      this.options = options;
      this.bounds = {
        x: (options.x as number) ?? 0,
        y: (options.y as number) ?? 0,
        width: (options.width as number) ?? 400,
        height: (options.height as number) ?? 300,
      };
    }
    on(event: string, handler: (...args: never[]) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }
    emit(event: string, ...args: never[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
    isDestroyed() {
      return this.destroyed;
    }
    getBounds() {
      return { ...this.bounds };
    }
    close() {
      this.emit("close");
      this.destroyed = true;
      this.emit("closed");
    }
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
  }
  return {
    BrowserWindow: MockWindow,
    screen: {
      getDisplayMatching: () => ({ workArea: { ...state.workArea } }),
    },
  };
});

vi.mock("./settings.js", () => ({
  getFloatWindows: () => JSON.parse(JSON.stringify(state.records)) as Record<string, FloatWindowRecord>,
  setFloatWindows: (records: Record<string, FloatWindowRecord>) => {
    state.records = JSON.parse(JSON.stringify(records)) as Record<string, FloatWindowRecord>;
  },
}));

vi.mock("./lifecycle.js", () => ({
  isQuitting: () => state.quitting,
}));

vi.mock("./window.js", () => ({
  getMainWindow: () => ({
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => {
        state.mainSent.push({ channel, payload });
      },
    },
  }),
  resolvePreloadPath: () => "/preload/index.js",
  resolveRendererLoad: () => state.rendererLoad,
}));

vi.mock("./ipc/context-menu.js", () => ({
  setupContextMenu: vi.fn(),
}));

import {
  closeAllFloats,
  closeFloatWindowByKey,
  closeFloatWindowByWebContents,
  closeFloatsForProject,
  floatWindowKey,
  handleFloatRendererGone,
  isFloatUrlAllowed,
  listFloatKeys,
  openFloatWindow,
  restoreFloatWindows,
} from "./float-window.js";

beforeEach(() => {
  for (const key of listFloatKeys()) closeFloatWindowByKey(key, { forget: true, silent: true });
  state.windows.length = 0;
  state.records = {};
  state.quitting = false;
  state.mainSent = [];
  state.workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  state.rendererLoad = { type: "file", file: "/renderer/index.html" };
  vi.useRealTimers();
});

describe("openFloatWindow", () => {
  it("creates a frameless always-on-top window with the float hash route", () => {
    const win = openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    expect(win).not.toBeNull();
    expect(state.windows).toHaveLength(1);
    const created = state.windows[0];
    expect(created.options.frame).toBe(false);
    expect(created.options.skipTaskbar).toBe(true);
    expect(created.options.alwaysOnTop).toBe(true);
    expect(created.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(created.loadFile).toHaveBeenCalledWith("/renderer/index.html", {
      hash: "/float/chat/p1/s1",
    });
    expect(state.records[floatWindowKey("chat", "p1", "s1")]).toMatchObject({
      kind: "chat",
      projectId: "p1",
      itemKey: "s1",
      open: true,
    });
  });

  it("encodes content file paths into the query string", () => {
    openFloatWindow({ kind: "content", projectId: "p1", itemKey: "C:\\proj\\a b.md" });
    expect(state.windows[0].loadFile).toHaveBeenCalledWith("/renderer/index.html", {
      hash: `/float/content/p1?path=${encodeURIComponent("C:\\proj\\a b.md")}`,
    });
  });

  it("focuses the existing window instead of creating a duplicate", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0].focus).toHaveBeenCalled();
  });

  it("uses the dev server URL when the renderer is served over http", () => {
    state.rendererLoad = { type: "url", url: "http://localhost:5173/" };
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    expect(state.windows[0].loadURL).toHaveBeenCalledWith(
      "http://localhost:5173/#/float/chat/p1/s1",
    );
  });

  it("clamps restored bounds to the current display work area", () => {
    state.workArea = { x: 0, y: 0, width: 800, height: 600 };
    const key = floatWindowKey("chat", "p1", "s1");
    state.records[key] = {
      kind: "chat",
      projectId: "p1",
      itemKey: "s1",
      bounds: { x: 5000, y: 5000, width: 2000, height: 2000 },
      open: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    const created = state.windows[0];
    expect(created.options.width).toBe(800);
    expect(created.options.height).toBe(600);
    expect(created.options.x).toBe(0);
    expect(created.options.y).toBe(0);
  });
});

describe("closing", () => {
  it("marks the record closed and notifies main with reason closed", () => {
    const key = floatWindowKey("chat", "p1", "s1");
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    expect(closeFloatWindowByKey(key)).toBe(true);
    expect(state.records[key].open).toBe(false);
    expect(state.mainSent).toHaveLength(1);
    expect(state.mainSent[0].channel).toBe("float-window:closed");
    expect(state.mainSent[0].payload).toMatchObject({ key, reason: "closed" });
  });

  it("dock close notifies main with reason dock", () => {
    const key = floatWindowKey("content", "p1", "a.md");
    openFloatWindow({ kind: "content", projectId: "p1", itemKey: "a.md" });
    closeFloatWindowByKey(key, { dock: true });
    expect(state.mainSent[0].payload).toMatchObject({ reason: "dock" });
    expect(state.records[key].open).toBe(false);
  });

  it("forget deletes the record", () => {
    const key = floatWindowKey("chat", "p1", "s1");
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    closeFloatWindowByKey(key, { forget: true });
    expect(state.records[key]).toBeUndefined();
  });

  it("keeps open=true and stays silent while quitting", () => {
    const key = floatWindowKey("chat", "p1", "s1");
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    state.quitting = true;
    closeFloatWindowByKey(key);
    expect(state.records[key].open).toBe(true);
    expect(state.mainSent).toHaveLength(0);
  });

  it("closeAllFloats preserves open flags for restart restore", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    openFloatWindow({ kind: "content", projectId: "p2", itemKey: "b.md" });
    closeAllFloats();
    expect(Object.values(state.records).every((r) => r.open)).toBe(true);
    expect(state.mainSent).toHaveLength(0);
    expect(listFloatKeys()).toHaveLength(0);
  });

  it("closes by sender webContents", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    const wc = state.windows[0].webContents;
    expect(closeFloatWindowByWebContents(wc as never)).toBe(true);
    expect(listFloatKeys()).toHaveLength(0);
  });
});

describe("closeFloatsForProject", () => {
  it("closes matching windows silently and deletes all records of the project", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    openFloatWindow({ kind: "content", projectId: "p2", itemKey: "b.md" });
    const stale = floatWindowKey("chat", "p1", "gone");
    state.records[stale] = {
      kind: "chat",
      projectId: "p1",
      itemKey: "gone",
      bounds: { x: 0, y: 0, width: 420, height: 600 },
      open: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    closeFloatsForProject("p1");
    expect(listFloatKeys()).toEqual([floatWindowKey("content", "p2", "b.md")]);
    expect(state.records[floatWindowKey("chat", "p1", "s1")]).toBeUndefined();
    expect(state.records[stale]).toBeUndefined();
    expect(state.mainSent).toHaveLength(0);
  });
});

describe("restoreFloatWindows", () => {
  function seed(key: string, projectId: string, open: boolean, updatedAt = "2026-01-01T00:00:00.000Z"): void {
    state.records[key] = {
      kind: "chat",
      projectId,
      itemKey: key.split(":").slice(2).join(":"),
      bounds: { x: 10, y: 10, width: 420, height: 600 },
      open,
      updatedAt,
    };
  }

  it("restores open records of registered projects up to the limit and prunes the rest", () => {
    seed("chat:p1:s1", "p1", true, "2026-01-04T00:00:00.000Z");
    seed("chat:p1:s2", "p1", true, "2026-01-03T00:00:00.000Z");
    seed("chat:p1:s3", "p1", true, "2026-01-02T00:00:00.000Z");
    seed("chat:p1:s4", "p1", true, "2026-01-01T00:00:00.000Z");
    seed("chat:px:s9", "px", true);
    seed("chat:p1:closed", "p1", false);
    restoreFloatWindows(["p1"]);
    expect(state.windows).toHaveLength(3);
    expect(state.records["chat:px:s9"]).toBeUndefined();
    expect(state.records["chat:p1:closed"]).toBeDefined();
  });

  it("restores the three most recently updated windows", () => {
    seed("chat:p1:old", "p1", true, "2026-01-01T00:00:00.000Z");
    seed("chat:p1:new", "p1", true, "2026-01-05T00:00:00.000Z");
    seed("chat:p1:mid", "p1", true, "2026-01-03T00:00:00.000Z");
    seed("chat:p1:older", "p1", true, "2026-01-02T00:00:00.000Z");
    seed("chat:p1:newest", "p1", true, "2026-01-06T00:00:00.000Z");
    restoreFloatWindows(["p1"]);
    expect(state.windows).toHaveLength(3);
    expect(listFloatKeys()).toEqual(
      expect.arrayContaining(["chat:p1:newest", "chat:p1:new", "chat:p1:mid"]),
    );
    expect(listFloatKeys()).not.toContain("chat:p1:old");
    expect(listFloatKeys()).not.toContain("chat:p1:older");
  });

  it("skips already-open windows", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    restoreFloatWindows(["p1"]);
    expect(state.windows).toHaveLength(1);
  });

  it("is idempotent across repeated restores", () => {
    seed("chat:p1:s1", "p1", true);
    restoreFloatWindows(["p1"]);
    restoreFloatWindows(["p1"]);
    expect(state.windows).toHaveLength(1);
  });
});

describe("handleFloatRendererGone", () => {
  it("destroys the crashed window and notifies main with reason crashed", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    const win = state.windows[0];
    handleFloatRendererGone(win.webContents as never, "crashed");
    expect(win.destroyed).toBe(true);
    expect(state.mainSent[0].payload).toMatchObject({ reason: "crashed" });
    expect(state.records[floatWindowKey("chat", "p1", "s1")].open).toBe(false);
  });

  it("ignores clean exits and unknown webContents", () => {
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    const win = state.windows[0];
    handleFloatRendererGone(win.webContents as never, "clean-exit");
    expect(win.destroyed).toBe(false);
    handleFloatRendererGone({} as never, "crashed");
    expect(state.mainSent).toHaveLength(0);
  });
});

describe("bounds persistence", () => {  it("persists bounds on move after debounce", () => {
    vi.useFakeTimers();
    const key = floatWindowKey("chat", "p1", "s1");
    openFloatWindow({ kind: "chat", projectId: "p1", itemKey: "s1" });
    const win = state.windows[0];
    win.bounds = { x: 100, y: 200, width: 500, height: 700 };
    win.emit("move");
    expect(state.records[key].bounds).toMatchObject({ x: 80, y: 80 });
    vi.advanceTimersByTime(500);
    expect(state.records[key].bounds).toMatchObject({ x: 100, y: 200, width: 500, height: 700 });
  });
});

describe("isFloatUrlAllowed", () => {
  it("only allows the exact renderer entry in file mode", () => {
    state.rendererLoad = { type: "file", file: "/renderer/index.html" };
    const entry = pathToFileURL("/renderer/index.html").href;
    expect(isFloatUrlAllowed(`${entry}#/float/chat/p1/s1`)).toBe(true);
    expect(isFloatUrlAllowed(entry)).toBe(true);
    expect(isFloatUrlAllowed(`${entry}other.html`)).toBe(false);
    expect(isFloatUrlAllowed("file:///etc/passwd")).toBe(false);
    expect(isFloatUrlAllowed("https://example.com/")).toBe(false);
  });

  it("allows the same origin in url mode", () => {
    state.rendererLoad = { type: "url", url: "http://localhost:5173/" };
    expect(isFloatUrlAllowed("http://localhost:5173/#/float/chat/p1/s1")).toBe(true);
    expect(isFloatUrlAllowed("http://localhost:53972/api/projects")).toBe(false);
    expect(isFloatUrlAllowed("not-a-url")).toBe(false);
  });
});
