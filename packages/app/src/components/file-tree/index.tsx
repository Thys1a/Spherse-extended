import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useI18n } from "@spherse/i18n/react";
import { cn } from "@/lib/utils";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { useProjectDirectory } from "../../queries/content";
import { useFileTreeController } from "./hooks/useFileTreeController";
import { useFileTreeSelection } from "./hooks/useFileTreeSelection";
import { buildTreeItems, type CreateAction } from "./tree-model";
import { hasFileDrag, extractDroppedFiles } from "./dnd";
import { FileTreeBlankMenu } from "./FileTreeBlankMenu";
import { FileTreeItem } from "./FileTreeNode";
import { FileTreeProvider } from "./file-tree-context";
import { InlineNameInput } from "./InlineNameInput";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export interface FileTreeProps {
  selectedFilePath?: string;
  onSelectFile: (filePath: string) => void;
  onDeleted?: (paths: string[]) => void;
  onRenamed?: (oldPath: string, newPath: string) => void;
  onOpenInNewTab?: (filePath: string) => void;
  onSplitFile?: (filePath: string) => void;
  onFloatFile?: (filePath: string) => void;
  floatedFilePaths?: Set<string>;
  rootPath?: string;
  emptyLabel?: string;
  readOnly?: boolean;
  uploadsEnabled?: boolean;
}

export function FileTree({ selectedFilePath, onSelectFile, onDeleted, onRenamed, onOpenInNewTab, onSplitFile, onFloatFile, floatedFilePaths, rootPath, emptyLabel, readOnly, uploadsEnabled }: FileTreeProps) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const basePath = rootPath ?? "";
  const ctrl = useFileTreeController(client, onDeleted, projectId, onRenamed);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selection = useFileTreeSelection(listRef, projectId, onSelectFile);
  const rootQuery = useProjectDirectory(projectId, client, basePath);
  const items = useMemo(
    () => (rootQuery.data ? buildTreeItems(rootQuery.data, basePath) : []),
    [rootQuery.data, basePath],
  );

  const dropFiles = uploadsEnabled && !readOnly ? ctrl.uploadFiles : undefined;

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadDirRef = useRef("");
  const handlePickUploadFiles = useCallback((dirPath: string) => {
    uploadDirRef.current = dirPath;
    uploadInputRef.current?.click();
  }, []);
  const pickUploadFiles = dropFiles ? handlePickUploadFiles : undefined;
  const handleUploadInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length > 0) {
      void dropFiles?.(uploadDirRef.current, files);
    }
  };

  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  const rootDragHandlers = dropFiles
    ? {
        onDragOver: (e: DragEvent) => {
          if (!hasFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropTargetDir(basePath);
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFileDrag(e.dataTransfer)) return;
          const related = e.relatedTarget;
          if (related instanceof Node && e.currentTarget.contains(related)) return;
          setDropTargetDir(null);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          setDropTargetDir(null);
          dropFiles(basePath, extractDroppedFiles(e.dataTransfer));
        },
      }
    : {};

  const ctxValue = {
    projectId,
    client,
    selectedFilePath,
    expandedPaths: ctrl.expandedPaths,
    creating: ctrl.creating,
    renaming: ctrl.renaming,
    selectFile: onSelectFile,
    selectedPaths: selection.selected,
    selectFileWithModifiers: selection.selectFileWithModifiers,
    selectSingle: selection.selectSingle,
    toggleDir: ctrl.toggleDir,
    expandDir: ctrl.expandDir,
    requestCreate: ctrl.requestCreate,
    submitCreate: ctrl.submitCreate,
    cancelCreate: ctrl.cancelCreate,
    requestRename: ctrl.requestRename,
    submitRename: ctrl.submitRename,
    cancelRename: ctrl.cancelRename,
    submitMove: ctrl.submitMove,
    dropTarget: ctrl.dropTarget,
    setDropTarget: ctrl.setDropTarget,
    requestDelete: ctrl.requestDelete,
    requestDeleteMany: ctrl.requestDeleteMany,
    onOpenInNewTab,
    onSplitFile,
    pickUploadFiles,
    onFloatFile,
    floatedFilePaths,
    readOnly,
    dropFiles,
    dropTargetDir,
    setDropTargetDir,
  };

  const requestBlankCreate = (action: CreateAction) => {
    ctrl.requestCreate({ name: "", path: basePath, type: "directory" }, action);
  };

  const list = (
    <>
      {rootQuery.isPending ? (
        <p className="px-2 text-xs text-sidebar-foreground/70">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="px-2 text-xs text-sidebar-foreground/70">{emptyLabel ?? t("file-tree.empty")}</p>
      ) : (
        <FileTreeProvider value={ctxValue}>
          {items.map((item) => (
            <FileTreeItem key={item.path} item={item} depth={0} />
          ))}
        </FileTreeProvider>
      )}
      {!readOnly && ctrl.creating && ctrl.creating.parentPath === basePath && (
        <InlineNameInput
          depth={0}
          onSubmit={(name) =>
            ctrl.submitCreate(ctrl.creating!.parentPath, ctrl.creating!.action, name)
          }
          onCancel={ctrl.cancelCreate}
        />
      )}
      {!readOnly && (
        <DeleteConfirmDialog
          targets={ctrl.deleteTargets}
          onConfirm={ctrl.confirmDelete}
          onCancel={ctrl.cancelDelete}
        />
      )}
      {dropFiles && (
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          hidden
          onChange={handleUploadInputChange}
        />
      )}
    </>
  );

  if (readOnly) {
    return (
      <div
        ref={listRef}
        className={cn(
          "flex flex-col gap-px text-xs",
          dropTargetDir === basePath && "rounded-sm bg-sidebar-accent ring-1 ring-sidebar-ring",
        )}
        {...rootDragHandlers}
      >
        {list}
      </div>
    );
  }

  return (
    <div
      className={cn(dropTargetDir === basePath && "rounded-sm bg-sidebar-accent ring-1 ring-sidebar-ring")}
      {...rootDragHandlers}
    >
      <FileTreeBlankMenu listRef={listRef} onCreate={requestBlankCreate}>
        {list}
      </FileTreeBlankMenu>
    </div>
  );
}
