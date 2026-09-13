import { useMemo, type DragEvent, type ReactNode } from "react";
import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { TreeRow } from "../../components/ui/tree-row";
import { useProjectDirectory } from "../../queries/content";
import { FILE_TREE_DRAG_MIME, buildTreeItems, canDropEntry, childPath, type TreeItem } from "./tree-model";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { InlineNameInput } from "./InlineNameInput";
import { useFileTreeCtx } from "./file-tree-context";

export function FileTreeItem({ item, depth }: { item: TreeItem; depth: number }) {
  if (item.type === "directory") {
    return <DirectoryNode item={item} depth={depth} />;
  }
  return <FileRow item={item} depth={depth} />;
}

function FileRow({ item, depth }: { item: TreeItem; depth: number }) {
  const {
    selectedFilePath,
    selectedPaths,
    selectFileWithModifiers,
    selectSingle,
    requestCreate,
    requestDelete,
    requestDeleteMany,
    requestRename,
    renaming,
    submitRename,
    cancelRename,
    onOpenInNewTab,
    onSplitFile,
    onFloatFile,
    floatedFilePaths,
    setDropTarget,
    readOnly,
  } = useFileTreeCtx();

  const isSelected = item.path === selectedFilePath || selectedPaths.has(item.path);

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(FILE_TREE_DRAG_MIME, item.path);
    e.dataTransfer.effectAllowed = "move";
  };

  if (renaming?.path === item.path) {
    return (
      <InlineNameInput
        depth={depth - 1}
        initialValue={renaming.name}
        onSubmit={submitRename}
        onCancel={cancelRename}
      />
    );
  }

  const row = (
    <TreeRow
      depth={depth}
      selected={isSelected}
      aria-selected={isSelected}
      data-path={item.path}
      onClick={(e) => selectFileWithModifiers(e, item.path)}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onOpenInNewTab?.(item.path);
      }}
      onContextMenu={() => {
        if (!selectedPaths.has(item.path)) selectSingle(item.path);
      }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDropTarget(null)}
    >
      <FileIcon className="size-4 shrink-0 text-sidebar-foreground/70" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {item.name}
      </span>
    </TreeRow>
  );

  if (readOnly) {
    return (
      <FileTreeContextMenu
        node={item}
        onCreate={(action) => requestCreate(item, action)}
        onDelete={() => requestDelete(item)}
        onOpenInNewTab={onOpenInNewTab}
        onSplitFile={onSplitFile}
        onFloatFile={onFloatFile}
        floatedFilePaths={floatedFilePaths}
        readOnly
      >
        {row}
      </FileTreeContextMenu>
    );
  }

  return (
    <FileTreeContextMenu
      node={item}
      onCreate={(action) => requestCreate(item, action)}
      onDelete={() => requestDelete(item)}
      onOpenInNewTab={onOpenInNewTab}
      onSplitFile={onSplitFile}
      onFloatFile={onFloatFile}
      floatedFilePaths={floatedFilePaths}
      onRename={() => requestRename(item)}
      selectedPaths={[...selectedPaths]}
      onDeleteSelected={(paths) => requestDeleteMany(paths)}
    >
      {row}
    </FileTreeContextMenu>
  );
}

function DirectoryNode({ item, depth }: { item: TreeItem; depth: number }) {
  const { t } = useI18n();
  const {
    projectId,
    client,
    expandedPaths,
    creating,
    renaming,
    toggleDir,
    expandDir,
    requestCreate,
    submitCreate,
    cancelCreate,
    requestRename,
    submitRename,
    cancelRename,
    submitMove,
    dropTarget,
    setDropTarget,
    requestDelete,
    readOnly,
  } = useFileTreeCtx();

  const expanded = expandedPaths.has(item.path);
  const highlighted = dropTarget === item.path;

  const handleDirDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(FILE_TREE_DRAG_MIME, item.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDirDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(FILE_TREE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== item.path) setDropTarget(item.path);
  };

  const handleDirDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const source = e.dataTransfer.getData(FILE_TREE_DRAG_MIME);
    if (!source || !canDropEntry(source, item.path)) return;
    const name = source.split("/").pop() ?? source;
    void submitMove(source, childPath(item.path, name)).then((moved) => {
      if (moved) expandDir(item.path);
    });
  };
  const query = useProjectDirectory(projectId, client, item.path, { enabled: expanded });
  const items = useMemo(
    () => (query.data ? buildTreeItems(query.data, item.path) : []),
    [query.data, item.path],
  );
  const isCreatingInThisDir = creating && creating.parentPath === item.path;

  const trigger = (
    <CollapsibleTrigger render={<TreeRow depth={depth} className="group" />}>
      <ChevronRightIcon className="size-4 shrink-0 text-sidebar-foreground/70 transition-transform group-data-[panel-open]:rotate-90" />
      <FolderIcon className="size-4 shrink-0 text-sidebar-foreground/70" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {item.name}
      </span>
    </CollapsibleTrigger>
  );

  const content = (
    <CollapsibleContent className="ml-2">
      <div className="flex flex-col gap-px">
        {isCreatingInThisDir && creating && (
          <InlineNameInput
            depth={depth + 1}
            onSubmit={(name) => submitCreate(creating.parentPath, creating.action, name)}
            onCancel={cancelCreate}
          />
        )}
        {expanded && query.isPending && (
          <p
            style={{ paddingLeft: (depth + 1) * 16 + 8 }}
            className="text-xs text-sidebar-foreground/70"
          >
            {t("common.loading")}
          </p>
        )}
        {items.map((child) => (
          <FileTreeItem key={child.path} item={child} depth={depth + 1} />
        ))}
      </div>
    </CollapsibleContent>
  );

  const renamingTrigger = renaming?.path === item.path ? (
    <InlineNameInput
      depth={depth - 1}
      initialValue={renaming.name}
      onSubmit={submitRename}
      onCancel={cancelRename}
    />
  ) : (
    trigger
  );

  const dropRow = (children: ReactNode) => (
    <div
      draggable
      onDragStart={handleDirDragStart}
      onDragEnd={() => setDropTarget(null)}
      onDragOver={handleDirDragOver}
      onDragLeave={() => {
        if (dropTarget === item.path) setDropTarget(null);
      }}
      onDrop={handleDirDrop}
      className={highlighted ? "rounded-md bg-sidebar-accent/70" : undefined}
    >
      {children}
    </div>
  );

  if (readOnly) {
    return (
      <Collapsible open={expanded} onOpenChange={() => toggleDir(item.path)}>
        <FileTreeContextMenu
          node={item}
          onCreate={(action) => requestCreate(item, action)}
          onDelete={() => requestDelete(item)}
          readOnly
        >
          {renamingTrigger}
        </FileTreeContextMenu>
        {content}
      </Collapsible>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={() => toggleDir(item.path)}>
      {dropRow(
        <FileTreeContextMenu
          node={item}
          onCreate={(action) => requestCreate(item, action)}
          onDelete={() => requestDelete(item)}
          onRename={() => requestRename(item)}
        >
          {renamingTrigger}
        </FileTreeContextMenu>,
      )}
      {content}
    </Collapsible>
  );
}
