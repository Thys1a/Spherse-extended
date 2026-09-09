import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { useTabRouteSync } from "./use-tab-route-sync";
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

function Harness({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  useTabRouteSync(projectId, enabled);
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}

function renderAt(route: string, enabled = true) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="project/:projectId/*" element={<Harness projectId="p1" enabled={enabled} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function loc(): string {
  const el = screen.getByTestId("loc");
  if (!el.textContent) throw new Error("empty location");
  return el.textContent;
}

describe("useTabRouteSync", () => {
  let originalLocalStorage: typeof globalThis.localStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    vi.stubGlobal("localStorage", createLocalStorageMock());
    useTabStore.setState({ byProject: {} });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it("builds a home tab from the project index route", () => {
    renderAt("/project/p1");

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].kind).toBe("home");
    expect(entry.activeTabId).toBe(entry.tabs[0].id);
  });

  it("builds a chat tab from a deep-linked chat route", () => {
    renderAt("/project/p1/chat/s1");

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0]).toMatchObject({ kind: "chat", sessionId: "s1" });
    expect(loc()).toBe("/project/p1/chat/s1");
  });

  it("projects tab activation to the URL without duplicating tabs", () => {
    renderAt("/project/p1");
    const homeId = useTabStore.getState().byProject["p1"].tabs[0].id;
    let chatId = "";
    act(() => {
      chatId = useTabStore.getState().openTab("p1", { kind: "chat", label: "s1", sessionId: "s1" });
    });

    expect(useTabStore.getState().byProject["p1"].activeTabId).toBe(chatId);
    expect(loc()).toBe("/project/p1/chat/s1");

    act(() => {
      useTabStore.getState().activate("p1", homeId);
    });

    expect(loc()).toBe("/project/p1");
    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(2);
  });

  it("does nothing when disabled", () => {
    renderAt("/project/p1/chat/s1", false);

    expect(useTabStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("ignores malformed chat encodings without crashing", () => {
    renderAt("/project/p1/chat/%E0");

    expect(useTabStore.getState().byProject["p1"]).toBeUndefined();
    expect(loc()).toBe("/project/p1/chat/%E0");
  });
});
