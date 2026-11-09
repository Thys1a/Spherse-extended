import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@spherse/i18n/react";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { HostBridgeProvider } from "../context/host-bridge-context";
import { createMockHostBridge } from "../test/host-bridge";
import { useAppStore } from "../stores/app-store";
import { useDetachedFloatStore } from "../stores/detached-float-store";
import { useFloatingChatStore } from "../features/floating-chat/store";
import { useFloatingContentBrowserStore } from "../features/floating-content-browser/store";
import type { FloatWindowClosedPayload } from "../lib/host-bridge";
import { FloatSyncBridge } from "./FloatSyncBridge";

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

let closedCb: ((payload: FloatWindowClosedPayload) => void) | null = null;
let navigateCb: ((payload: { route: string }) => void) | null = null;

function setup() {
  const bridge = createMockHostBridge({
    floatWindow: {
      open: vi.fn(async () => ({ ok: true as const })),
      closeSelf: vi.fn(async () => true),
      navigateMain: vi.fn(async () => true),
      list: vi.fn(async () => ["chat:p1:s1"]),
      onClosed: vi.fn((cb: (payload: FloatWindowClosedPayload) => void) => {
        closedCb = cb;
        return () => {
          closedCb = null;
        };
      }),
      onNavigateMain: vi.fn((cb: (payload: { route: string }) => void) => {
        navigateCb = cb;
        return () => {
          navigateCb = null;
        };
      }),
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <FloatSyncBridge />
            <LocationProbe />
          </>
        ),
      },
      { path: "/project/:projectId", element: <LocationProbe /> },
    ],
    { initialEntries: ["/"] },
  );
  const result = render(
    <I18nProvider locale="en">
      <HostBridgeProvider bridge={bridge}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </HostBridgeProvider>
    </I18nProvider>,
  );
  return { ...result, bridge };
}

beforeEach(() => {
  localStorage.clear();
  closedCb = null;
  navigateCb = null;
  useAppStore.setState({
    connection: { baseUrl: "http://localhost:5173", accessToken: null },
    projects: new Map([
      ["p1", { id: "p1", path: "/tmp/p1", name: "p1", lastOpened: "2026-01-01T00:00:00.000Z" }],
    ]),
    activeProjectId: "p1",
    initializing: false,
  });
  useDetachedFloatStore.setState({ keys: new Set() });
  useFloatingChatStore.setState({ byProject: {} });
  useFloatingContentBrowserStore.setState({ byProject: {} });
});

describe("FloatSyncBridge", () => {
  it("hydrates detached keys from the main process", async () => {
    setup();
    await waitFor(() => {
      expect(useDetachedFloatStore.getState().keys.has("chat:p1:s1")).toBe(true);
    });
  });

  it("routes overlay opens of detached items to the native window", async () => {
    const { bridge } = setup();
    await waitFor(() => {
      expect(useDetachedFloatStore.getState().keys.has("chat:p1:s1")).toBe(true);
    });
    useFloatingChatStore.getState().setFloatingChat("p1", {
      sessionId: "s1",
      position: { x: 0, y: 0 },
      size: { width: 420, height: 600 },
      mode: "full",
    });
    expect(bridge.floatWindow?.open).toHaveBeenCalledWith({
      kind: "chat",
      projectId: "p1",
      itemKey: "s1",
    });
    expect(useFloatingChatStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("restores the chat overlay clamped to the viewport on dock", async () => {
    setup();
    await waitFor(() => {
      expect(closedCb).not.toBeNull();
    });
    act(() => {
      closedCb!({
        key: "chat:p1:s1",
        kind: "chat",
        projectId: "p1",
        itemKey: "s1",
        bounds: { x: 5000, y: 5000, width: 2000, height: 2000 },
        reason: "dock",
      });
    });
    expect(useDetachedFloatStore.getState().keys.has("chat:p1:s1")).toBe(false);
    expect(useFloatingChatStore.getState().byProject["p1"]).toMatchObject({
      sessionId: "s1",
      position: { x: 0, y: 0 },
      size: { width: window.innerWidth, height: window.innerHeight },
      mode: "full",
    });
  });

  it("restores the content overlay on crash", async () => {
    setup();
    await waitFor(() => {
      expect(closedCb).not.toBeNull();
    });
    act(() => {
      closedCb!({
        key: "content:p1:a.md",
        kind: "content",
        projectId: "p1",
        itemKey: "a.md",
        bounds: { x: 10, y: 20, width: 420, height: 600 },
        reason: "crashed",
      });
    });
    const entry = useFloatingContentBrowserStore.getState().byProject["p1"]?.["a.md"];
    expect(entry).toMatchObject({
      position: { x: 10, y: 20 },
      size: { width: 420, height: 600 },
    });
  });

  it("only drops the detached key on a plain close", async () => {
    setup();
    await waitFor(() => {
      expect(useDetachedFloatStore.getState().keys.has("chat:p1:s1")).toBe(true);
    });
    act(() => {
      closedCb!({
        key: "chat:p1:s1",
        kind: "chat",
        projectId: "p1",
        itemKey: "s1",
        bounds: { x: 0, y: 0, width: 420, height: 600 },
        reason: "closed",
      });
    });
    expect(useDetachedFloatStore.getState().keys.has("chat:p1:s1")).toBe(false);
    expect(useFloatingChatStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("ignores dock notifications for unknown projects", async () => {
    setup();
    await waitFor(() => {
      expect(closedCb).not.toBeNull();
    });
    act(() => {
      closedCb!({
        key: "chat:p9:s1",
        kind: "chat",
        projectId: "p9",
        itemKey: "s1",
        bounds: { x: 0, y: 0, width: 420, height: 600 },
        reason: "dock",
      });
    });
    expect(useFloatingChatStore.getState().byProject["p9"]).toBeUndefined();
  });

  it("forwards float navigation requests to the main router", async () => {
    setup();
    await waitFor(() => {
      expect(navigateCb).not.toBeNull();
    });
    act(() => {
      navigateCb!({ route: "/project/p1" });
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/project/p1");
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = setup();
    await waitFor(() => {
      expect(closedCb).not.toBeNull();
    });
    unmount();
    expect(closedCb).toBeNull();
    expect(navigateCb).toBeNull();
  });

  it("does nothing without the floatWindow capability", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: "/", element: <FloatSyncBridge /> }],
      { initialEntries: ["/"] },
    );
    expect(() =>
      render(
        <I18nProvider locale="en">
          <HostBridgeProvider bridge={createMockHostBridge()}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </HostBridgeProvider>
        </I18nProvider>,
      ),
    ).not.toThrow();
    expect(useDetachedFloatStore.getState().keys.size).toBe(0);
  });
});
