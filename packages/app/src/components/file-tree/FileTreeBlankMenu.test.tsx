import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { FileTreeBlankMenu } from "./FileTreeBlankMenu";

describe("FileTreeBlankMenu", () => {
  it("opens create items on blank right-click and reports the action", () => {
    const onCreate = vi.fn();
    renderWithProviders(
      <FileTreeBlankMenu onCreate={onCreate}>
        <p>empty</p>
      </FileTreeBlankMenu>,
    );

    fireEvent.contextMenu(screen.getByText("empty"));

    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.newFile")));
    expect(onCreate).toHaveBeenCalledWith("new-file");
  });

  it("opens the folder item on blank right-click", () => {
    const onCreate = vi.fn();
    renderWithProviders(
      <FileTreeBlankMenu onCreate={onCreate}>
        <p>empty</p>
      </FileTreeBlankMenu>,
    );

    fireEvent.contextMenu(screen.getByText("empty"));
    fireEvent.click(screen.getByText(translate("zh-CN", "file-tree.newFolder")));

    expect(onCreate).toHaveBeenCalledWith("new-folder");
  });

  it("does not open the blank menu on a node with its own menu", () => {
    renderWithProviders(
      <FileTreeBlankMenu onCreate={() => {}}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-path="a.md">row</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>inner-item</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </FileTreeBlankMenu>,
    );

    fireEvent.contextMenu(screen.getByText("row"));

    expect(screen.getByText("inner-item")).toBeInTheDocument();
    expect(screen.queryByText(translate("zh-CN", "file-tree.newFile"))).toBeNull();
  });
});
