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
});
