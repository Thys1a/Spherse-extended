import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { FileTreeContextMenu } from "./FileTreeContextMenu";

describe("FileTreeContextMenu", () => {
  it("calls onOpenInNewTab with the node path", () => {
    const onOpenInNewTab = vi.fn();
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onOpenInNewTab={onOpenInNewTab}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));
    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.openInNewTab")));

    expect(onOpenInNewTab).toHaveBeenCalledWith("a.md");
  });

  it("hides mutation items in readOnly mode but keeps open and copy items", () => {
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onOpenInNewTab={() => {}}
        onFloatFile={() => {}}
        floatedFilePaths={new Set()}
        readOnly
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.getByText(translate("zh-CN", "file-tree.openInNewTab"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "file-tree.float"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "file-tree.copyPath"))).toBeInTheDocument();
    expect(screen.queryByText(translate("zh-CN", "file-tree.newFile"))).toBeNull();
    expect(screen.queryByText(translate("zh-CN", "file-tree.newFolder"))).toBeNull();
    expect(screen.queryByText(translate("zh-CN", "common.delete"))).toBeNull();
  });

  it("calls onRename when the rename item is clicked", () => {
    const onRename = vi.fn();
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={onRename}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));
    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.rename")));

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("hides the rename item in readOnly mode", () => {
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        readOnly
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.queryByText(translate("zh-CN", "file-tree.rename"))).toBeNull();
  });

  it("shows batch items when the node is in a multi-selection", () => {
    const onDeleteSelected = vi.fn();
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "b.md", path: "b.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        selectedPaths={["a.md", "b.md", "c.md"]}
        onDeleteSelected={onDeleteSelected}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(
      screen.getByText(translate("zh-CN", "file-tree.deleteSelected", { count: 3 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(translate("zh-CN", "file-tree.copyPaths", { count: 3 })),
    ).toBeInTheDocument();
    expect(screen.queryByText(translate("zh-CN", "file-tree.rename"))).toBeNull();
    expect(screen.queryByText(translate("zh-CN", "common.delete"))).toBeNull();

    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.deleteSelected", { count: 3 })));

    expect(onDeleteSelected).toHaveBeenCalledWith(["a.md", "b.md", "c.md"]);
  });

  it("copies all selected paths in batch mode", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "b.md", path: "b.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        selectedPaths={["a.md", "b.md"]}
        onDeleteSelected={() => {}}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));
    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.copyPaths", { count: 2 })));

    expect(writeText).toHaveBeenCalledWith("a.md\nb.md");
  });

  it("shows single items when the node is outside the selection", () => {
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "z.md", path: "z.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        selectedPaths={["a.md", "b.md"]}
        onDeleteSelected={() => {}}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.getByText(translate("zh-CN", "common.delete"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "file-tree.rename"))).toBeInTheDocument();
    expect(
      screen.queryByText(translate("zh-CN", "file-tree.deleteSelected", { count: 2 })),
    ).toBeNull();
  });

  it("calls onSplitFile with the node path", () => {
    const onSplitFile = vi.fn();
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onSplitFile={onSplitFile}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));
    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.splitRight")));

    expect(onSplitFile).toHaveBeenCalledWith("a.md");
  });

  it("hides the split item for directories", () => {
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "docs", path: "docs", type: "directory" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onSplitFile={() => {}}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.queryByText(translate("zh-CN", "file-tree.splitRight"))).toBeNull();
  });

  it("shows full menu for editable files", () => {
    renderWithProviders(
      <FileTreeContextMenu
        node={{ name: "a.md", path: "a.md", type: "file" }}
        onCreate={() => {}}
        onDelete={() => {}}
        onFloatFile={() => {}}
        floatedFilePaths={new Set()}
      >
        <div>row</div>
      </FileTreeContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.queryByText(translate("zh-CN", "file-tree.openInNewTab"))).toBeNull();
    expect(screen.getByText(translate("zh-CN", "file-tree.float"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "file-tree.newFile"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "file-tree.copyPath"))).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "common.delete"))).toBeInTheDocument();
  });
});
