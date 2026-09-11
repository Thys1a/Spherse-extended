import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { translate } from "@spherse/i18n";

const { mockUseProjectCatalog, mockUseApiClient } = vi.hoisted(() => ({
  mockUseProjectCatalog: vi.fn(),
  mockUseApiClient: vi.fn(),
}));

vi.mock("../../queries/project", () => ({
  useProjectCatalog: mockUseProjectCatalog,
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: mockUseApiClient,
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

import { renderWithProviders } from "../../test/render";
import { TabStrip } from "./TabStrip";
import { useTabStore } from "./tab-store";

describe("TabStrip", () => {
  let originalLocalStorage: typeof globalThis.localStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    vi.stubGlobal("localStorage", createLocalStorageMock());
    useTabStore.setState({ byProject: {} });
    mockUseProjectCatalog.mockReset().mockReturnValue({
      sessions: [{ id: "s1", title: "Session One", agentId: "a1" }],
      agents: [],
    });
    mockUseApiClient.mockReset().mockReturnValue({});
    useTabStore.getState().openTab("p1", { kind: "chat", label: "s1", sessionId: "s1" });
    useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "a.md" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it("renders tabs with session titles", () => {
    renderWithProviders(<TabStrip projectId="p1" />);

    expect(screen.getByText("Session One")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
  });

  it("activates a tab on click", () => {
    renderWithProviders(<TabStrip projectId="p1" />);
    expect(useTabStore.getState().byProject["p1"].activeTabId).not.toBeNull();

    const firstTab = screen.getByText("Session One").closest('[role="tab"]');
    if (!firstTab) throw new Error("tab not found");
    fireEvent.click(firstTab);

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.find((t) => t.id === entry.activeTabId)?.sessionId).toBe("s1");
  });

  it("closes a tab via the close button", () => {
    renderWithProviders(<TabStrip projectId="p1" />);

    const closeButtons = screen.getAllByLabelText(translate("zh-CN", "tabs.closeTab"));
    expect(closeButtons).toHaveLength(2);
    fireEvent.click(closeButtons[1]);

    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(1);
  });

  it("closes other tabs via context menu", () => {
    renderWithProviders(<TabStrip projectId="p1" />);

    const contentTab = screen.getByText("a.md").closest('[role="tab"]');
    if (!contentTab) throw new Error("tab not found");
    fireEvent.contextMenu(contentTab);
    fireEvent.click(screen.getByText(translate("zh-CN", "tabs.closeOthers")));

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].filePath).toBe("a.md");
    expect(entry.activeTabId).toBe(entry.tabs[0].id);
  });

  it("closes all tabs via context menu", () => {
    renderWithProviders(<TabStrip projectId="p1" />);

    const chatTab = screen.getByText("Session One").closest('[role="tab"]');
    if (!chatTab) throw new Error("tab not found");
    fireEvent.contextMenu(chatTab);
    fireEvent.click(screen.getByText(translate("zh-CN", "tabs.closeAll")));

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].kind).toBe("home");
  });

  it("closes a tab via context menu", () => {
    renderWithProviders(<TabStrip projectId="p1" />);

    const contentTab = screen.getByText("a.md").closest('[role="tab"]');
    if (!contentTab) throw new Error("tab not found");
    fireEvent.contextMenu(contentTab);
    const items = screen.getAllByText(translate("zh-CN", "tabs.closeTab"));
    const menuItem = items.find((el) => el.closest('[data-slot="context-menu-item"]'));
    if (!menuItem) throw new Error("menu item not found");
    fireEvent.click(menuItem);

    expect(useTabStore.getState().byProject["p1"].tabs).toHaveLength(1);
  });

  it("reorders tabs via drag and drop", () => {
    renderWithProviders(<TabStrip projectId="p1" />);
    const before = useTabStore.getState().byProject["p1"].tabs.map((t) => t.kind);
    expect(before).toEqual(["chat", "content"]);

    const chatTab = screen.getByText("Session One").closest('[role="tab"]');
    const contentTab = screen.getByText("a.md").closest('[role="tab"]');
    if (!chatTab || !contentTab) throw new Error("tab not found");
    fireEvent.dragStart(chatTab);
    fireEvent.dragOver(contentTab);
    fireEvent.drop(contentTab);

    expect(useTabStore.getState().byProject["p1"].tabs.map((t) => t.kind)).toEqual(["content", "chat"]);
  });
});
