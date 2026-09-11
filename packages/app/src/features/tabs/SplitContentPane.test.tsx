import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { useSplitStore } from "./split-store";
import { SplitContentPane } from "./SplitContentPane";

const seenProps: Array<{
  filePath: string;
  onBack?: () => void;
  onClose?: () => void;
  onNavigate?: (filePath: string) => void;
}> = [];

vi.mock("../content-browser", () => ({
  ContentBrowser: (props: {
    filePath: string;
    onBack?: () => void;
    onClose?: () => void;
    onNavigate?: (filePath: string) => void;
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
});
