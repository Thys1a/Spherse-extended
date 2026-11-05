import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@spherse/i18n/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { HostBridgeProvider } from "../context/host-bridge-context";
import { useProjectCtx } from "../context/project-context";
import { createMockHostBridge } from "../test/host-bridge";
import { useAppStore } from "../stores/app-store";
import { FloatProjectScope } from "./FloatProjectScope";

function CtxProbe() {
  const ctx = useProjectCtx();
  return <p data-testid="ctx">{`${ctx.projectId}:${ctx.projectRoot}`}</p>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(initialEntry: string, fetchImpl: (url: string) => Promise<Response>) {
  const bridge = createMockHostBridge({
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
    floatWindow: {
      open: vi.fn(async () => ({ ok: true as const })),
      closeSelf: vi.fn(async () => true),
      navigateMain: vi.fn(async () => true),
      list: vi.fn(async () => []),
      onClosed: vi.fn(() => () => {}),
      onNavigateMain: vi.fn(() => () => {}),
    },
  });
  vi.stubGlobal("fetch", vi.fn((url: string) => fetchImpl(url)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/float/chat/:projectId/:sessionId",
        element: <FloatProjectScope />,
        children: [{ index: true, element: <CtxProbe /> }],
      },
    ],
    { initialEntries: [initialEntry] },
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
  vi.unstubAllGlobals();
  useAppStore.setState({
    connection: { baseUrl: "http://localhost:53972", accessToken: null },
    projects: new Map(),
    activeProjectId: null,
    initializing: false,
  });
});

describe("FloatProjectScope", () => {
  it("provides the project context from ensureProject without touching active project", async () => {
    const { bridge } = setup("/float/chat/p1/s1", async (url) => {
      if (url.endsWith("/api/projects/p1/info")) {
        return jsonResponse({
          id: "p1",
          name: "p1",
          rootPath: "/tmp/p1",
          lastOpened: "2026-01-01T00:00:00.000Z",
        });
      }
      return jsonResponse([]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("ctx")).toHaveTextContent("p1:/tmp/p1");
    });
    expect(useAppStore.getState().activeProjectId).toBeNull();
    expect(bridge.project?.setLastActiveProject).not.toHaveBeenCalled();
  });

  it("forgets the window when the project is gone", async () => {
    const { bridge } = setup("/float/chat/p1/s1", async () =>
      jsonResponse({ error: "Unknown project" }, 404),
    );

    await waitFor(() => {
      expect(bridge.floatWindow?.closeSelf).toHaveBeenCalledWith({ forget: true });
    });
  });

  it("shows retry UI on transient errors instead of forgetting", async () => {
    const { bridge } = setup("/float/chat/p1/s1", async () =>
      jsonResponse({ error: "boom" }, 500),
    );

    await screen.findByRole("button", { name: "Retry" });
    expect(bridge.floatWindow?.closeSelf).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fetch).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bridge.floatWindow?.closeSelf).toHaveBeenCalledWith();
  });
});
