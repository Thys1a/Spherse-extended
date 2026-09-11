import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

describe("DeleteConfirmDialog", () => {
  it("renders the single file message", () => {
    renderWithProviders(
      <DeleteConfirmDialog
        targets={[{ name: "a.md", path: "a.md", type: "file" }]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByText(translate("zh-CN", "file-tree.confirmDeleteFile", { name: "a.md" })),
    ).toBeInTheDocument();
  });

  it("renders the single directory message", () => {
    renderWithProviders(
      <DeleteConfirmDialog
        targets={[{ name: "docs", path: "docs", type: "directory" }]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByText(translate("zh-CN", "file-tree.confirmDeleteDir", { name: "docs" })),
    ).toBeInTheDocument();
  });

  it("renders the batch message with count", () => {
    renderWithProviders(
      <DeleteConfirmDialog
        targets={[
          { name: "a.md", path: "a.md", type: "file" },
          { name: "b.md", path: "b.md", type: "file" },
        ]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByText(translate("zh-CN", "file-tree.confirmDeleteMany", { count: 2 })),
    ).toBeInTheDocument();
  });

  it("confirms batch deletion", () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeleteConfirmDialog
        targets={[
          { name: "a.md", path: "a.md", type: "file" },
          { name: "b.md", path: "b.md", type: "file" },
        ]}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    screen.getByText(translate("zh-CN", "common.delete")).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
