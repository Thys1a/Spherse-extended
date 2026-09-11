import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import type { CreateAction, TreeItem } from "./tree-model";

export function FileTreeContextMenu({
  node,
  children,
  onCreate,
  onDelete,
  onOpenInNewTab,
  onSplitFile,
  onFloatFile,
  floatedFilePaths,
  onRename,
  selectedPaths,
  onDeleteSelected,
  readOnly,
}: {
  node: TreeItem;
  children: React.ReactNode;
  onCreate: (action: CreateAction) => void;
  onDelete: () => void;
  onOpenInNewTab?: (filePath: string) => void;
  onSplitFile?: (filePath: string) => void;
  onFloatFile?: (filePath: string) => void;
  floatedFilePaths?: Set<string>;
  onRename?: () => void;
  selectedPaths?: readonly string[];
  onDeleteSelected?: (paths: string[]) => void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const isFloated = floatedFilePaths?.has(node.path) ?? false;
  const batchPaths = selectedPaths ?? [];
  const batch = !readOnly && batchPaths.length > 1 && batchPaths.includes(node.path);
  const showOpenGroup = node.type === "file" && (onOpenInNewTab !== undefined || onSplitFile !== undefined || onFloatFile !== undefined);
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {showOpenGroup && (
          <>
            {onOpenInNewTab && (
              <ContextMenuItem onClick={() => onOpenInNewTab(node.path)}>
                {t("file-tree.openInNewTab")}
              </ContextMenuItem>
            )}
            {onSplitFile && (
              <ContextMenuItem onClick={() => onSplitFile(node.path)}>
                {t("file-tree.splitRight")}
              </ContextMenuItem>
            )}
            {onFloatFile && (
              <ContextMenuItem onClick={() => onFloatFile(node.path)}>
                {isFloated ? t("file-tree.cancelFloat") : t("file-tree.float")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        {!readOnly && (
          <>
            <ContextMenuItem onClick={() => onCreate("new-file")}>
              {t("file-tree.newFile")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onCreate("new-folder")}>
              {t("file-tree.newFolder")}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onClick={() => {
            const text = batch ? batchPaths.join("\n") : node.path;
            navigator.clipboard.writeText(text).catch(() => {});
            toast.success(t("file-tree.pathCopied"));
          }}
        >
          {batch ? t("file-tree.copyPaths", { count: batchPaths.length }) : t("file-tree.copyPath")}
        </ContextMenuItem>
        {!readOnly && onRename && !batch && (
          <ContextMenuItem onClick={onRename}>
            {t("file-tree.rename")}
          </ContextMenuItem>
        )}
        {!readOnly && (
          <>
            <ContextMenuSeparator />
            {batch && onDeleteSelected ? (
              <ContextMenuItem variant="destructive" onClick={() => onDeleteSelected([...batchPaths])}>
                {t("file-tree.deleteSelected", { count: batchPaths.length })}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem variant="destructive" onClick={onDelete}>
                {t("common.delete")}
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
