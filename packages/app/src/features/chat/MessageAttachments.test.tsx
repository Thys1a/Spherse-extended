import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { MessageAttachments } from "./MessageAttachments";
import type { ChatAttachment } from "./types";

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    getPreviewUrl: (path: string) => `http://localhost:5173/api/projects/p1/preview/${path}`,
    getAttachmentDownloadUrl: (path: string) =>
      `http://localhost:5173/api/projects/p1/attachments/download/${path}`,
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

function renderAttachments(attachments: ChatAttachment[]) {
  renderWithProviders(<MessageAttachments attachments={attachments} />, {
    bridge: createMockHostBridge(),
  });
}

describe("MessageAttachments file rows", () => {
  it("renders a download link for non-image attachments", () => {
    renderAttachments([
      { type: "text", path: ".spherse/attachments/note.txt", mimeType: "text/plain", name: "note.txt", bytes: 100 },
    ]);
    const link = screen.getByRole("link", { name: "下载" });
    expect(link.getAttribute("href")).toBe(
      "http://localhost:5173/api/projects/p1/attachments/download/.spherse/attachments/note.txt",
    );
    expect(screen.getByText("note.txt")).toBeInTheDocument();
  });

  it("shows the truncation hint when the file exceeds the inline budget", () => {
    renderAttachments([
      { type: "text", path: ".spherse/attachments/big.txt", mimeType: "text/plain", name: "big.txt", bytes: 48 * 1024 },
    ]);
    expect(screen.getByText(/仅前 16 KB 进入上下文/)).toBeInTheDocument();
  });

  it("shows no truncation hint for small files", () => {
    renderAttachments([
      { type: "text", path: ".spherse/attachments/small.txt", mimeType: "text/plain", name: "small.txt", bytes: 100 },
    ]);
    expect(screen.queryByText(/进入上下文/)).not.toBeInTheDocument();
  });

  it("keeps rendering image thumbnails", () => {
    renderAttachments([
      { type: "image", path: ".spherse/attachments/pic.png", mimeType: "image/png" },
    ]);
    expect(document.querySelector('img[src$="pic.png"]')).not.toBeNull();
  });
});
