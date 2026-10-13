import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { useTabStore } from "./tab-store";
import { useSplitStore } from "./split-store";
import { SplitContentPane } from "./SplitContentPane";

const seenProps: Array<{
  filePath: string;
  onBack?: () => void;
  onClose?: () => void;
  onNavigate?: (filePath: string) => void;
  onUnsplit?: () => void;
}> = [];

vi.mock("../content-browser", () => ({
  ContentBrowser: (props: {
    filePath: string;
    onBack?: () => void;
    onClose?: () => void;
    onNavigate?: (filePath: string) => void;
    onUnsplit?: () => void;
  }) => {
    seenProps.push(props);
    return <div data-testid="content-browser">{props.filePath}</div>;
  },
}));

vi.mock("../../queries/project", () => ({
  useProjectCatalog: () => ({ agents: [], sessions: [] }),
  createProjectSession: vi.fn(),
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({}),
  useConnection: () => ({ baseUrl: "", accessToken: null }),
}));

describe("SplitContentPane", () => {
  beforeEach(() => {
    seenProps.length = 0;
    useTabStore.setState({ byProject: {} });
    useSplitStore.setState({ byProject: {} });
  });

  it("renders the split file without a split entry point", () => {
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    expect(screen.getByTestId("content-browser")).toHaveTextContent("b.md");
    expect(seenProps[0]).not.toHaveProperty("onSplit");
  });

  it("routes internal navigation to setFile", () => {
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onNavigate?.("c.md");

    expect(useSplitStore.getState().byProject["p1"]?.filePath).toBe("c.md");
  });

  it("closes the split on back and close", () => {
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onClose?.();

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("returns the file to the main area as a tab and closes the split", () => {
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onUnsplit?.();

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0]).toMatchObject({ kind: "content", filePath: "b.md" });
    expect(entry.activeTabId).toBe(entry.tabs[0].id);
    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("activates the existing tab instead of duplicating it", () => {
    const id = useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" }, { force: true });
    useTabStore.getState().openTab("p1", { kind: "content", label: "c.md", filePath: "c.md" }, { force: true });
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onUnsplit?.();

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.filter((t) => t.filePath === "b.md")).toHaveLength(1);
    expect(entry.activeTabId).toBe(id);
    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("never rewrites another tab when returning to main", () => {
    const a = useTabStore.getState().openTab("p1", { kind: "content", label: "a.md", filePath: "a.md" }, { force: true });
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onUnsplit?.();

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.find((t) => t.id === a)).toMatchObject({ filePath: "a.md", label: "a.md" });
    const opened = entry.tabs.find((t) => t.filePath === "b.md");
    expect(opened).toBeDefined();
    expect(opened?.id).not.toBe(a);
    expect(entry.activeTabId).toBe(opened?.id);
    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("prefers the active tab when the file is open twice", () => {
    useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" }, { force: true });
    const second = useTabStore.getState().openTab("p1", { kind: "content", label: "b.md", filePath: "b.md" }, { force: true });
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<SplitContentPane projectId="p1" filePath="b.md" />);

    seenProps[0].onUnsplit?.();

    const entry = useTabStore.getState().byProject["p1"];
    expect(entry.tabs.filter((t) => t.filePath === "b.md")).toHaveLength(2);
    expect(entry.activeTabId).toBe(second);
    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });
});
