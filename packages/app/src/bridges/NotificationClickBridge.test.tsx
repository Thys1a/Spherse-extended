import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationClickBridge } from "./NotificationClickBridge";
import { HostBridgeProvider } from "../context/host-bridge-context";
import { createMockHostBridge } from "../test/host-bridge";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("NotificationClickBridge", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("navigates to the route delivered by the host", () => {
    let listener: ((route: string) => void) | null = null;
    const bridge = createMockHostBridge({
      onNotificationClicked: vi.fn((callback: (route: string) => void) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HostBridgeProvider bridge={bridge}>
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
          <NotificationClickBridge />
        </HostBridgeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/");
    act(() => {
      listener?.("/project/p1/chat/s2");
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/project/p1/chat/s2");
  });

  it("works without a host subscription", () => {
    const bridge = createMockHostBridge({ onNotificationClicked: undefined });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HostBridgeProvider bridge={bridge}>
          <NotificationClickBridge />
        </HostBridgeProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});
