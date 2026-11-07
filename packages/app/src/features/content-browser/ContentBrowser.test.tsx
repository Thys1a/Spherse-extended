import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { ContentBrowser } from "./index";

const HTML = "<html><body><h1>hi</h1></body></html>";

const { mockReadContent } = vi.hoisted(() => ({ mockReadContent: vi.fn() }));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    getPreviewUrl: (path: string) => `http://localhost:5173/api/projects/p1/preview/${path}`,
    getContent: vi.fn(),
    readContent: mockReadContent,
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

function renderBrowser() {
  return renderWithProviders(
    <ContentBrowser filePath="page.html" onBack={() => {}} onClose={() => {}} />,
    { bridge: createMockHostBridge(), queryClient: createTestQueryClient() },
  );
}

describe("ContentBrowser html edit find", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadContent.mockResolvedValue({ path: "page.html", content: HTML, binary: false });
  });

  it("shows the find toggle when entering edit from preview", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await waitFor(() => expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "查找" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    const findButton = await screen.findByRole("button", { name: "查找" });
    await user.click(findButton);
    expect(document.querySelector("[data-content-edit-findbar]")).not.toBeNull();
  });

  it("shows the find toggle when entering edit from source", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await waitFor(() => expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "源码" }));
    await user.click(screen.getByRole("button", { name: "编辑" }));
    const findButton = await screen.findByRole("button", { name: "查找" });
    await user.click(findButton);
    expect(document.querySelector("[data-content-edit-findbar]")).not.toBeNull();
  });
});
