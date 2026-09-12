import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { ProjectProvider } from "../../context/project-context";

const { mockUseProjectCatalog, mockUseProjectSession, mockUseApiClient, mockUseFeature } = vi.hoisted(() => ({
  mockUseProjectCatalog: vi.fn(),
  mockUseProjectSession: vi.fn(),
  mockUseApiClient: vi.fn(),
  mockUseFeature: vi.fn(),
}));

vi.mock("../../queries/project", () => ({
  useProjectCatalog: mockUseProjectCatalog,
  useProjectSession: mockUseProjectSession,
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: mockUseApiClient,
}));

vi.mock("../../lib/use-feature", () => ({
  useFeature: mockUseFeature,
}));

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

import { FloatingChatManager } from "./FloatingChatManager";
import { useFloatingChatStore } from "./store";

function Harness() {
  const location = useLocation();
  return (
    <>
      <FloatingChatManager />
      <div data-testid="loc">{location.pathname + location.search}</div>
    </>
  );
}

function ProbeTree() {
  return (
    <ProjectProvider projectId="p1" projectRoot="/tmp/p1">
      <Harness />
    </ProjectProvider>
  );
}

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="project/:projectId/chat/:sessionId" element={<ProbeTree />} />
        <Route path="project/:projectId" element={<ProbeTree />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FloatingChatManager tabs bounce", () => {
  let originalLocalStorage: typeof globalThis.localStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    vi.stubGlobal("localStorage", createLocalStorageMock());
    useFloatingChatStore.setState({ byProject: {} });
    mockUseProjectCatalog.mockReset().mockReturnValue({ sessions: [], agents: [] });
    mockUseProjectSession.mockReset().mockReturnValue({ data: undefined, isSuccess: false });
    mockUseApiClient.mockReset().mockReturnValue({});
    mockUseFeature.mockReset().mockReturnValue(true);
    useFloatingChatStore.getState().setFloatingChat("p1", {
      sessionId: "s1",
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      mode: "full",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it("keeps the route when tabs are on and the floating session matches", () => {
    renderAt("/project/p1/chat/s1");

    expect(screen.getByTestId("loc").textContent).toBe("/project/p1/chat/s1");
  });

  it("bounces to the project index when tabs are off and the floating session matches", () => {
    mockUseFeature.mockReturnValue(false);

    renderAt("/project/p1/chat/s1");

    expect(screen.getByTestId("loc").textContent).toBe("/project/p1");
  });
});
