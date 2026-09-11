import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStore } from "./tab-store";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };
}

describe("useTabStore", () => {
  let originalLocalStorage: typeof globalThis.localStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    vi.stubGlobal("localStorage", createLocalStorageMock());
    useTabStore.setState({ byProject: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it("openTab creates and activates a chat tab", () => {
    const id = useTabStore.getState().openTab("p1", { kind: "chat", label: "s1", sessionId: "s1" });

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0]).toMatchObject({ id, kind: "chat", label: "s1", sessionId: "s1" });
    expect(entry.activeTabId).toBe(id);
  });

  it("openTab reuses the tab for the same session", () => {
    const first = useTabStore.getState().openTab("p1", { kind: "chat", label: "s1", sessionId: "s1" });
    const second = useTabStore.getState().openTab("p1", { kind: "chat", label: "s1-renamed", sessionId: "s1" });

    expect(second).toBe(first);
    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].label).toBe("s1-renamed");
    expect(entry.activeTabId).toBe(first);
  });

  it("openTab creates separate tabs per filePath and url", () => {
    useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "a.md" });
    useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" });
    useTabStore.getState().openTab("p1", { kind: "browser", label: "u", url: "http://localhost:3000" });

    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(3);
  });

  it("openTab with force creates a duplicate tab for the same file", () => {
    const first = useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "a.md" });
    const second = useTabStore.getState().openTab(
      "p1",
      { kind: "content", label: "a.md", filePath: "a.md" },
      { force: true },
    );

    expect(second).not.toBe(first);
    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(2);
    expect(entry.activeTabId).toBe(second);
  });

  it("openTab reuses the single home tab per project", () => {
    const first = useTabStore.getState().openTab("p1", { kind: "home", label: "home" });
    const second = useTabStore.getState().openTab("p1", { kind: "home", label: "home" });

    expect(second).toBe(first);
    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(1);
  });

  it("closeTab transfers activation to the neighbor", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    const b = useTabStore.getState().openTab("p1", { kind: "chat", label: "b", sessionId: "b" });
    useTabStore.getState().activate("p1", a);

    useTabStore.getState().closeTab("p1", a);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.map((t) => t.id)).toEqual([b]);
    expect(entry.activeTabId).toBe(b);
  });

  it("closeTab of a background tab keeps activation", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    const b = useTabStore.getState().openTab("p1", { kind: "chat", label: "b", sessionId: "b" });

    useTabStore.getState().closeTab("p1", a);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.map((t) => t.id)).toEqual([b]);
    expect(entry.activeTabId).toBe(b);
  });

  it("closeTab of the last tab falls back to home", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });

    useTabStore.getState().closeTab("p1", a);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].kind).toBe("home");
    expect(entry.activeTabId).toBe(entry.tabs[0].id);
  });

  it("closeOthers keeps only the target tab and activates it", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    const b = useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" });
    useTabStore.getState().activate("p1", a);

    useTabStore.getState().closeOthers("p1", b);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.map((t) => t.id)).toEqual([b]);
    expect(entry.activeTabId).toBe(b);
  });

  it("closeOthers ignores unknown project or tab", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });

    useTabStore.getState().closeOthers("p1", "missing");
    useTabStore.getState().closeOthers("nope", a);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.map((t) => t.id)).toEqual([a]);
    expect(entry.activeTabId).toBe(a);
    expect(useTabStore.getState().byProject["nope"]).toBeUndefined();
  });

  it("closeAll rebuilds a single home tab", () => {
    useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" });

    useTabStore.getState().closeAll("p1");

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].kind).toBe("home");
    expect(entry.activeTabId).toBe(entry.tabs[0].id);
  });

  it("closeAll ignores unknown project", () => {
    useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });

    useTabStore.getState().closeAll("nope");

    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(1);
    expect(useTabStore.getState().byProject["nope"]).toBeUndefined();
  });

  it("remapPaths rewrites content tabs under the old prefix", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "docs/a.md" });
    const b = useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "docs/sub/b.md" });
    const c = useTabStore.getState().openTab("p1", { kind: "chat", label: "s", sessionId: "s" });

    useTabStore.getState().remapPaths("p1", "docs", "notes");

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.find((t) => t.id === a)).toMatchObject({ filePath: "notes/a.md", label: "a.md" });
    expect(entry.tabs.find((t) => t.id === b)).toMatchObject({ filePath: "notes/sub/b.md", label: "b.md" });
    expect(entry.tabs.find((t) => t.id === c)).toMatchObject({ filePath: undefined });
  });

  it("remapPaths ignores unknown project or unmatched prefix", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "a.md" });

    useTabStore.getState().remapPaths("p1", "other", "new");
    useTabStore.getState().remapPaths("nope", "a.md", "b.md");

    expect(useTabStore.getState().byProject["p1"].tabs.map((t) => t.id)).toEqual([a]);
    expect(useTabStore.getState().byProject["nope"]).toBeUndefined();
  });

  it("reorder moves tabs", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    const b = useTabStore.getState().openTab("p1", { kind: "chat", label: "b", sessionId: "b" });

    useTabStore.getState().reorder("p1", 1, 0);

    expect(useTabStore.getState().byProject["p1"].tabs.map((t) => t.id)).toEqual([b, a]);
  });

  it("reorder ignores out-of-range indexes", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });

    useTabStore.getState().reorder("p1", 0, 5);
    useTabStore.getState().reorder("p1", -1, 0);

    expect(useTabStore.getState().byProject["p1"].tabs.map((t) => t.id)).toEqual([a]);
  });

  it("clearProject removes the project entry", () => {
    useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });
    useTabStore.getState().openTab("p2", { kind: "chat", label: "b", sessionId: "b" });

    useTabStore.getState().clearProject("p1");

    expect(useTabStore.getState().byProject["p1"]).toBeUndefined();
    expect(useTabStore.getState().byProject["p2"].tabs).toHaveLength(1);
  });

  it("persists tabs to localStorage", () => {
    useTabStore.getState().openTab("p1", { kind: "chat", label: "a", sessionId: "a" });

    const raw = (globalThis.localStorage as Storage).getItem("spherse:tabs");
    const parsed = JSON.parse(raw ?? "{}") as Record<string, { tabs: Array<{ sessionId?: string }> }>;
    expect(parsed["p1"].tabs[0].sessionId).toBe("a");
  });

  it("drops invalid tabs and repairs dangling activeTabId on load", async () => {
    const dirty = {
      p1: {
        tabs: [
          { id: "good", kind: "chat", projectId: "p1", label: "a", sessionId: "a" },
          { id: "bad-kind", kind: "video", projectId: "p1", label: "x" },
          { id: "no-identity", kind: "chat", projectId: "p1", label: "y" },
          { id: "cross-project", kind: "chat", projectId: "p2", label: "z", sessionId: "z" },
          { id: 42, kind: "home", projectId: "p1", label: "" },
        ],
        activeTabId: "missing",
      },
    };
    const backing = new Map<string, string>([["spherse:tabs", JSON.stringify(dirty)]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => backing.clear(),
    });
    vi.resetModules();
    const { useTabStore: fresh } = await import("./tab-store");

    const entry = fresh.getState().byProject["p1"];
    expect(entry.tabs.map((t) => t.id)).toEqual(["good"]);
    expect(entry.activeTabId).toBe("good");
    vi.resetModules();
  });

  it("returns empty state for unparseable storage", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{{{",
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });
    vi.resetModules();
    const { useTabStore: fresh } = await import("./tab-store");

    expect(fresh.getState().byProject).toEqual({});
    vi.resetModules();
  });
});
