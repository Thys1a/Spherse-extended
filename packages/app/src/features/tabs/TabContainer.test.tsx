import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { useTabStore } from "./tab-store";
import { useSplitStore } from "./split-store";
import { TabContainer } from "./TabContainer";

vi.mock("./TabPanel", () => ({
  TabPanel: ({ tab }: { tab: { id: string } }) => <div data-testid={`panel-${tab.id}`} />,
}));

vi.mock("./SplitContentPane", () => ({
  SplitContentPane: ({ filePath }: { filePath: string }) => <div data-testid="split-pane">{filePath}</div>,
}));

function setTabs() {
  useTabStore.setState({
    byProject: {
      p1: {
        tabs: [{ id: "t1", kind: "home", projectId: "p1", label: "" }],
        activeTabId: "t1",
      },
    },
  });
}

describe("TabContainer split layout", () => {
  beforeEach(() => {
    useTabStore.setState({ byProject: {} });
    useSplitStore.setState({ byProject: {} });
    vi.restoreAllMocks();
  });

  it("renders a single column without a split", () => {
    setTabs();
    renderWithProviders(<TabContainer projectId="p1" />);

    expect(screen.getByTestId("panel-t1")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.queryByTestId("split-pane")).toBeNull();
  });

  it("renders two panes and a divider with a split", () => {
    setTabs();
    useSplitStore.getState().openSplit("p1", "b.md");
    renderWithProviders(<TabContainer projectId="p1" />);

    expect(screen.getByTestId("panel-t1")).toBeInTheDocument();
    expect(screen.getByTestId("split-pane")).toHaveTextContent("b.md");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("commits the dragged ratio on mouseup", () => {
    setTabs();
    useSplitStore.getState().openSplit("p1", "b.md");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      toJSON: () => {},
    });
    renderWithProviders(<TabContainer projectId="p1" />);

    const separator = screen.getByRole("separator");
    fireEvent.mouseDown(separator, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 600 });
    fireEvent.mouseUp(document);

    expect(useSplitStore.getState().byProject["p1"]?.ratio).toBeCloseTo(0.6);
  });

  it("clamps the dragged ratio into range", () => {
    setTabs();
    useSplitStore.getState().openSplit("p1", "b.md");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      toJSON: () => {},
    });
    renderWithProviders(<TabContainer projectId="p1" />);

    const separator = screen.getByRole("separator");
    fireEvent.mouseDown(separator, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 1500 });
    fireEvent.mouseUp(document);

    expect(useSplitStore.getState().byProject["p1"]?.ratio).toBe(0.8);
  });
});
