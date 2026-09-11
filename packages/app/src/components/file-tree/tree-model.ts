import type { FileEntry } from "../../lib/types";

type TreeItemType = "file" | "directory";

export interface TreeItem {
  name: string;
  path: string;
  type: TreeItemType;
}

export type CreateAction = "new-file" | "new-folder";

export interface CreatingState {
  parentPath: string;
  action: CreateAction;
}

export interface RenamingState {
  path: string;
  name: string;
}

export interface DeleteTarget {
  name: string;
  path: string;
  type: TreeItemType;
}

export const INVALID_NAME_RE = /[/\\:]/;

export function childPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

export function parentDirPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export const FILE_TREE_DRAG_MIME = "text/spherse-file-path";

export function canDropEntry(draggedPath: string, targetDir: string): boolean {
  if (draggedPath === targetDir) return false;
  if (parentDirPath(draggedPath) === targetDir) return false;
  if (targetDir.startsWith(`${draggedPath}/`)) return false;
  return true;
}

export function buildTreeItems(entries: FileEntry[], parentPath: string): TreeItem[] {
  return entries
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((entry) => ({
      name: entry.name,
      path: childPath(parentPath, entry.name),
      type: entry.type,
    }));
}
