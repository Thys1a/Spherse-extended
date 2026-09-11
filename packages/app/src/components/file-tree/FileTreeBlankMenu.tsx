import type { Ref } from "react";
import { useI18n } from "@spherse/i18n/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import type { CreateAction } from "./tree-model";

export function FileTreeBlankMenu({
  listRef,
  onCreate,
  children,
}: {
  listRef?: Ref<HTMLDivElement>;
  onCreate: (action: CreateAction) => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <ContextMenu>
      <ContextMenuTrigger ref={listRef} className="flex flex-col gap-px text-xs">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onCreate("new-file")}>
          {t("file-tree.newFile")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCreate("new-folder")}>
          {t("file-tree.newFolder")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
