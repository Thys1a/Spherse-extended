import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { useTabStore } from "./tab-store";
import { useSplitStore } from "./split-store";
import { TabPanel } from "./TabPanel";

vi.mock("../content-browser", () => ({
  ContentBrowser: ({ onSplit }: { onSplit?: () => void }) => (
    <button aria-label="split" onClick={onSplit} />
  ),
}));

vi.mock("../../queries/project", () => ({
  useProjectCatalog: () => ({ agents: [], sessions: [] }),
  createProjectSession: vi.fn(),
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({}),
  useConnection: () => ({ baseUrl: "", accessToken: null }),
}));

describe("TabPanel content split", () => {
  beforeEach(() => {
    useTabStore.setState({ byProject: {} });
    useSplitStore.setState({ byProject: {} });
  });

  it("moves the open file to the split pane instead of duplicating it", () => {
    const tab = { id: "t1", kind: "content", projectId: "p1", label: "a.md", filePath: "a.md" } as const;
    useTabStore.setState({ byProject: { p1: { tabs: [{ ...tab }], activeTabId: "t1" } } });
    renderWithProviders(<TabPanel projectId="p1" tab={{ ...tab }} />);

    fireEvent.click(screen.getByLabelText("split"));

    const tabs = useTabStore.getState().byProject["p1"]?.tabs ?? [];
    expect(tabs.find((t) => t.id === "t1")).toBeUndefined();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ kind: "home" });
    expect(useSplitStore.getState().byProject["p1"]).toMatchObject({ filePath: "a.md" });
  });

  it("only closes the split file tab and keeps the others", () => {
    const tab = { id: "t1", kind: "content", projectId: "p1", label: "a.md", filePath: "a.md" } as const;
    useTabStore.setState({
      byProject: {
        p1: {
          tabs: [{ ...tab }, { id: "t2", kind: "content", projectId: "p1", label: "b.md", filePath: "b.md" }],
          activeTabId: "t1",
        },
      },
    });
    renderWithProviders(<TabPanel projectId="p1" tab={{ ...tab }} />);

    fireEvent.click(screen.getByLabelText("split"));

    const tabs = useTabStore.getState().byProject["p1"]?.tabs ?? [];
    expect(tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(useSplitStore.getState().byProject["p1"]).toMatchObject({ filePath: "a.md" });
  });
});
