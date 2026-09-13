import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { FileTree } from "./index";

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    listContent: vi.fn(async () => [{ name: "a.md", type: "file" }]),
    deleteContent: vi.fn(),
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

describe("FileTree middle-click", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function renderTree(onOpenInNewTab: (path: string) => void) {
    renderWithProviders(
      <FileTree
        selectedFilePath={undefined}
        onSelectFile={() => {}}
        onOpenInNewTab={onOpenInNewTab}
      />,
      { queryClient: createTestQueryClient(), bridge: createMockHostBridge() },
    );
  }

  it("opens in a new tab on middle-click", async () => {
    const onOpenInNewTab = vi.fn();
    renderTree(onOpenInNewTab);

    const row = await screen.findByText("a.md");
    fireEvent(row, new MouseEvent("auxclick", { bubbles: true, button: 1 }));

    expect(onOpenInNewTab).toHaveBeenCalledWith("a.md");
  });

  it("ignores non-middle aux clicks", async () => {
    const onOpenInNewTab = vi.fn();
    renderTree(onOpenInNewTab);

    const row = await screen.findByText("a.md");
    fireEvent(row, new MouseEvent("auxclick", { bubbles: true, button: 2 }));

    expect(onOpenInNewTab).not.toHaveBeenCalled();
  });
});
