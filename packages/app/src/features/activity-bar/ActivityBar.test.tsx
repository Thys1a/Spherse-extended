import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { ActivityBar } from "./index";
import { useAppStore } from "../../stores/app-store";
import { useCustomSidePanelStore } from "../../stores/custom-side-panel-store";
import { useCustomSidePanel } from "../../queries/custom-side-panel";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({}) ,
  useGlobalApiClient: () => null,
}));

vi.mock("../../queries/custom-side-panel", () => ({
  useCustomSidePanel: vi.fn(),
  updateCustomSidePanelSettings: vi.fn(),
}));

function seedProjects(activeProjectId: string | null = "p1"): void {
  useAppStore.setState({
    projects: new Map([
      ["p1", { id: "p1", path: "/tmp/p1", name: "P1", lastOpened: "2026-10-16T00:00:00.000Z" }],
      ["p2", { id: "p2", path: "/tmp/p2", name: "P2", lastOpened: "2026-10-15T00:00:00.000Z" }],
    ]),
    activeProjectId,
  });
}

function mockPanelQuery(path: string | null): void {
  vi.mocked(useCustomSidePanel).mockReturnValue({ data: { path }, isError: false } as never);
}

function mockPanelQueryLoading(): void {
  vi.mocked(useCustomSidePanel).mockReturnValue({ data: undefined, isError: false } as never);
}

function openAvatarMenu(name: string): void {
  fireEvent.contextMenu(screen.getByTitle(name));
}

describe("ActivityBar custom side panel toggle", () => {
  beforeEach(() => {
    seedProjects();
    useCustomSidePanelStore.setState({ activeByProject: {} });
    mockPanelQuery("panel/index.html");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the default label by default and toggles to inactive on click", () => {
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P1");
    const item = screen.getByText(translate("zh-CN", "activity-bar.showDefaultSidePanel"));
    fireEvent.click(item);

    expect(useCustomSidePanelStore.getState().isActive("p1")).toBe(false);
  });

  it("shows the custom label when explicitly closed", () => {
    useCustomSidePanelStore.getState().setActive("p1", false);
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P1");
    expect(
      screen.getByText(translate("zh-CN", "activity-bar.showCustomSidePanel")),
    ).toBeInTheDocument();
  });

  it("disables the toggle when no panel path is configured", () => {
    mockPanelQuery(null);
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P1");
    const item = screen.getByText(translate("zh-CN", "activity-bar.showCustomSidePanel"));
    expect(item.closest("[aria-disabled='true'],[data-disabled]")).not.toBeNull();
  });

  it("disables the toggle while the panel query is loading", () => {
    mockPanelQueryLoading();
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P1");
    const item = screen.getByText(translate("zh-CN", "activity-bar.showCustomSidePanel"));
    expect(item.closest("[aria-disabled='true'],[data-disabled]")).not.toBeNull();
  });

  it("hides the toggle on non-active projects", () => {
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P2");
    expect(screen.queryByText(translate("zh-CN", "activity-bar.showCustomSidePanel"))).toBeNull();
    expect(screen.queryByText(translate("zh-CN", "activity-bar.showDefaultSidePanel"))).toBeNull();
  });

  it("keeps the toggle but hides the settings submenu when editing is disabled", () => {
    renderWithProviders(<ActivityBar />, {
      bridge: createMockHostBridge({ capabilities: { content: { editable: false } } }),
      queryClient: createTestQueryClient(),
    });

    openAvatarMenu("P1");
    expect(
      screen.getByText(translate("zh-CN", "activity-bar.showDefaultSidePanel")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(translate("zh-CN", "activity-bar.settings.sidePanel")),
    ).toBeNull();
  });
});
