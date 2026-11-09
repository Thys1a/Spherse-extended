import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@spherse/i18n/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { HostBridgeProvider } from "../context/host-bridge-context";
import { createMockHostBridge } from "../test/host-bridge";
import { useAppStore } from "../stores/app-store";
import { useSettingsStore } from "../stores/settings-store";
import { useBusStore } from "../stores/bus-store";
import { FloatRoot } from "./FloatRoot";

function setup() {
  const bridge = createMockHostBridge({
    getServerBaseUrl: vi.fn(async () => "http://localhost:53972"),
    project: {
      selectDirectory: vi.fn(),
      selectSkillZip: vi.fn(),
      openProject: vi.fn(),
      restoreProjects: vi.fn(),
      addOpenProject: vi.fn(),
      closeProject: vi.fn(),
      openProjectFolder: vi.fn(),
      openFileExternal: vi.fn(),
      setLastActiveProject: vi.fn(),
      getLastActiveProject: vi.fn(),
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/float",
        element: <FloatRoot />,
        children: [{ index: true, element: <p>float child</p> }],
      },
    ],
    { initialEntries: ["/float"] },
  );
  render(
    <I18nProvider locale="en">
      <HostBridgeProvider bridge={bridge}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </HostBridgeProvider>
    </I18nProvider>,
  );
  return { bridge };
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    connection: { baseUrl: "", accessToken: null },
    projects: new Map(),
    activeProjectId: null,
    initializing: false,
  });
  useSettingsStore.setState({ loaded: false, locale: "zh-CN" });
  vi.spyOn(useBusStore.getState(), "init").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FloatRoot", () => {
  it("initializes connection, settings and bus without restoring projects", async () => {
    const { bridge } = setup();

    await vi.waitFor(() => {
      expect(useAppStore.getState().connection.baseUrl).toBe("http://localhost:53972");
    });
    expect(useBusStore.getState().init).toHaveBeenCalledWith(bridge);
    expect(bridge.project?.restoreProjects).not.toHaveBeenCalled();
    expect(useAppStore.getState().projects.size).toBe(0);
    expect(useAppStore.getState().activeProjectId).toBeNull();
  });

  it("never writes last-route or last-active state", async () => {
    const { bridge } = setup();

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().loaded).toBe(true);
    });
    expect(bridge.project?.setLastActiveProject).not.toHaveBeenCalled();
    const lastRouteKeys = Object.keys(localStorage).filter((k) => k.startsWith("spherse:last-route:"));
    expect(lastRouteKeys).toHaveLength(0);
  });
});
