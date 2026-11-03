import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@spherse/i18n/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { HostBridgeProvider } from "../context/host-bridge-context";
import { createMockHostBridge } from "../test/host-bridge";
import { useAppStore } from "../stores/app-store";
import { FloatChatPage } from "./FloatChatPage";

function setup(fetchImpl: (url: string) => Promise<Response>) {
  const bridge = createMockHostBridge({
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
        element: <FloatChatPage />,
      },
    ],
    { initialEntries: ["/float/chat/p1/s1"] },
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("FloatChatPage", () => {
  it("forgets the window when the session is confirmed missing", async () => {
    const { bridge } = setup(async (url) => {
      if (url.endsWith("/agents")) return jsonResponse([]);
      if (url.includes("/sessions")) return jsonResponse({ ok: true, sessions: [], byAgent: {} });
      return jsonResponse([]);
    });

    await waitFor(() => {
      expect(bridge.floatWindow?.closeSelf).toHaveBeenCalledWith({ forget: true });
    });
  });

  it("shows retry UI on load errors instead of forgetting", async () => {
    const { bridge } = setup(async () => {
      throw new Error("network down");
    });

    await screen.findByText("Failed to load");
    expect(bridge.floatWindow?.closeSelf).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fetch).toHaveBeenCalledTimes(3);

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    await userEvent.click(closeButtons[closeButtons.length - 1]);
    expect(bridge.floatWindow?.closeSelf).toHaveBeenCalledWith();
  });
});
