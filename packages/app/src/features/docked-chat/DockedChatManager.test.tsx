import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";

const { mockUseProjectCatalog, mockUseProjectSession, mockUseApiClient } = vi.hoisted(() => ({
  mockUseProjectCatalog: vi.fn(),
  mockUseProjectSession: vi.fn(),
  mockUseApiClient: vi.fn(),
}));

vi.mock("../chat", () => ({
  Chat: () => <div data-testid="docked-chat" />,
}));

vi.mock("../../queries/project", () => ({
  useProjectCatalog: mockUseProjectCatalog,
  useProjectSession: mockUseProjectSession,
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: mockUseApiClient,
}));

import { renderWithProviders } from "../../test/render";
import { DockedChatManager } from "./DockedChatManager";
import { useDockedChatStore } from "./store";

function makeIframe(rect: { left: number; top: number; right: number; bottom: number }) {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue({
    left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    width: rect.right - rect.left, height: rect.bottom - rect.top,
    x: rect.left, y: rect.top, toJSON: () => ({}),
  } as DOMRect);
  return { iframe, source: iframe.contentWindow as unknown as MessageEventSource };
}

const session = { id: "s1", agentId: "a1" };
const agent = { id: "a1", name: "Agent" };

describe("DockedChatManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    for (const source of Array.from(useDockedChatStore.getState().entries.keys())) {
      useDockedChatStore.getState().undock(source);
    }
    mockUseProjectCatalog.mockReset().mockReturnValue({
      sessions: [session],
      agents: [agent],
    });
    mockUseProjectSession.mockReset().mockReturnValue({
      data: undefined,
      isSuccess: false,
    });
    mockUseApiClient.mockReset().mockReturnValue({});
  });

  it("renders nothing when no dock entries exist", () => {
    const { container } = renderWithProviders(<DockedChatManager />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the chat panel composed from iframe rect + slot rect, clamped", () => {
    const { iframe, source } = makeIframe({ left: 100, top: 200, right: 400, bottom: 600 });
    useDockedChatStore.getState().dock(source, "s1", iframe);
    useDockedChatStore.getState().setSlotRect(source, { x: 0, y: 0, width: 500, height: 800 });

    renderWithProviders(<DockedChatManager />);

    expect(screen.getByTestId("docked-chat")).toBeTruthy();
    const panel = document.body.querySelector(".fixed.z-30") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.left).toBe("100px");
    expect(panel.style.top).toBe("200px");
    expect(panel.style.width).toBe("300px");
    expect(panel.style.height).toBe("400px");
  });

  it("offsets the panel by the slot position inside the iframe", () => {
    const { iframe, source } = makeIframe({ left: 0, top: 0, right: 1000, bottom: 1000 });
    useDockedChatStore.getState().dock(source, "s1", iframe);
    useDockedChatStore.getState().setSlotRect(source, { x: 40, y: 60, width: 120, height: 80 });

    renderWithProviders(<DockedChatManager />);

    const panel = document.body.querySelector(".fixed.z-30") as HTMLElement;
    expect(panel.style.left).toBe("40px");
    expect(panel.style.top).toBe("60px");
    expect(panel.style.width).toBe("120px");
    expect(panel.style.height).toBe("80px");
  });

  it("renders nothing before the first slot rect arrives", () => {
    const { iframe, source } = makeIframe({ left: 0, top: 0, right: 500, bottom: 500 });
    useDockedChatStore.getState().dock(source, "s1", iframe);

    const { container } = renderWithProviders(<DockedChatManager />);
    expect(screen.queryByTestId("docked-chat")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("undocks when the session no longer exists", () => {
    const { iframe, source } = makeIframe({ left: 0, top: 0, right: 500, bottom: 500 });
    useDockedChatStore.getState().dock(source, "gone", iframe);
    useDockedChatStore.getState().setSlotRect(source, { x: 0, y: 0, width: 100, height: 100 });
    mockUseProjectSession.mockReturnValue({ data: undefined, isSuccess: true });
    mockUseProjectCatalog.mockReturnValue({ sessions: [], agents: [agent] });

    renderWithProviders(<DockedChatManager />);

    expect(useDockedChatStore.getState().entries.size).toBe(0);
  });

  it("undocks when the iframe element is removed from the document", async () => {
    const { iframe, source } = makeIframe({ left: 0, top: 0, right: 500, bottom: 500 });
    useDockedChatStore.getState().dock(source, "s1", iframe);
    useDockedChatStore.getState().setSlotRect(source, { x: 0, y: 0, width: 100, height: 100 });

    renderWithProviders(<DockedChatManager />);
    expect(screen.getByTestId("docked-chat")).toBeTruthy();

    iframe.remove();
    document.dispatchEvent(new CustomEvent("scroll"));

    await waitFor(() => expect(useDockedChatStore.getState().entries.size).toBe(0));
    cleanup();
  });

  it("undocks when the iframe reloads and contentWindow is replaced", async () => {
    const { iframe, source } = makeIframe({ left: 0, top: 0, right: 500, bottom: 500 });
    useDockedChatStore.getState().dock(source, "s1", iframe);
    useDockedChatStore.getState().setSlotRect(source, { x: 0, y: 0, width: 100, height: 100 });

    renderWithProviders(<DockedChatManager />);
    expect(screen.getByTestId("docked-chat")).toBeTruthy();

    vi.spyOn(iframe, "contentWindow", "get").mockReturnValue({} as Window);
    document.dispatchEvent(new CustomEvent("scroll"));

    await waitFor(() => expect(useDockedChatStore.getState().entries.size).toBe(0));
    cleanup();
  });
});