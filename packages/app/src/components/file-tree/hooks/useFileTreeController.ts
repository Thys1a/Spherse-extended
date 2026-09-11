import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import type { ApiClient } from "../../../lib/api";
import { useDirtyPathsStore } from "../../../lib/dirty-paths";
import {
  type TreeItem,
  type CreatingState,
  type RenamingState,
  type DeleteTarget,
  type CreateAction,
  INVALID_NAME_RE,
  parentDirPath,
  childPath,
} from "../tree-model";
import { invalidateProjectFileQueries } from "../../../queries/content";
import { useTabStore } from "../../../features/tabs/tab-store";

export interface FileTreeController {
  expandedPaths: ReadonlySet<string>;
  creating: CreatingState | null;
  renaming: RenamingState | null;
  deleteTargets: DeleteTarget[] | null;
  dropTarget: string | null;
  toggleDir: (path: string) => void;
  expandDir: (path: string) => void;
  requestCreate: (item: TreeItem, action: CreateAction) => void;
  submitCreate: (parentPath: string, action: CreateAction, name: string) => void;
  cancelCreate: () => void;
  requestRename: (item: TreeItem) => void;
  submitRename: (name: string) => void;
  cancelRename: () => void;
  submitMove: (source: string, destination: string) => Promise<boolean>;
  setDropTarget: (path: string | null) => void;
  requestDelete: (item: TreeItem) => void;
  requestDeleteMany: (paths: string[]) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
}

export function useFileTreeController(
  client: ApiClient,
  onDeleted: ((paths: string[]) => void) | undefined,
  projectId: string,
  onRenamed?: (oldPath: string, newPath: string) => void,
): FileTreeController {
  const { t } = useI18n();
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [renaming, setRenaming] = useState<RenamingState | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    setExpandedPaths(new Set());
    setCreating(null);
    setRenaming(null);
    setDeleteTargets(null);
    setDropTarget(null);
  }, [projectId]);

  const toggleDir = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandDir = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const requestCreate = useCallback(
    (item: TreeItem, action: CreateAction) => {
      const parentPath = item.type === "directory" ? item.path : parentDirPath(item.path);
      if (item.type === "directory") {
        expandDir(item.path);
      }
      setRenaming(null);
      setCreating({ parentPath, action });
    },
    [expandDir],
  );

  const submitCreate = useCallback(
    async (parentPath: string, action: CreateAction, name: string) => {
      if (!name || INVALID_NAME_RE.test(name)) return;
      const targetPath = childPath(parentPath, name);
      try {
        if (action === "new-folder") {
          await client.mkdir(targetPath);
        } else {
          await client.touchFile(targetPath);
        }
        setCreating(null);
        await invalidateProjectFileQueries(projectId, targetPath);
      } catch (err) {
        toast.error(t("file-tree.createFailed", { message: (err as Error).message }));
      }
    },
    [client, projectId, t],
  );

  const cancelCreate = useCallback(() => setCreating(null), []);

  const requestRename = useCallback((item: TreeItem) => {
    setCreating(null);
    setRenaming({ path: item.path, name: item.name });
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const applyMove = useCallback(
    async (
      source: string,
      destination: string,
      failedKey: "file-tree.renameFailed" | "file-tree.moveFailed",
    ): Promise<boolean> => {
      if (useDirtyPathsStore.getState().isDirtyUnder(projectId, source)) {
        toast.error(t("file-tree.renameBlockedDirty"));
        return false;
      }
      try {
        await client.moveContent(source, destination);
        setRenaming((prev) => (prev?.path === source ? null : prev));
        setExpandedPaths((prev) => {
          const prefix = `${source}/`;
          let changed = false;
          const next = new Set<string>();
          for (const p of prev) {
            if (p === source || p.startsWith(prefix)) {
              changed = true;
              next.add(p === source ? destination : destination + p.slice(source.length));
            } else {
              next.add(p);
            }
          }
          return changed ? next : prev;
        });
        useTabStore.getState().remapPaths(projectId, source, destination);
        useDirtyPathsStore.getState().remapPaths(projectId, source, destination);
        onRenamed?.(source, destination);
        await invalidateProjectFileQueries(projectId, source);
        await invalidateProjectFileQueries(projectId, destination);
        return true;
      } catch (err) {
        toast.error(t(failedKey, { message: (err as Error).message }));
        return false;
      }
    },
    [client, projectId, onRenamed, t],
  );

  const submitRename = useCallback(
    async (name: string) => {
      if (!renaming) return;
      const trimmed = name.trim();
      if (!trimmed || INVALID_NAME_RE.test(trimmed)) return;
      if (trimmed === renaming.name) {
        setRenaming(null);
        return;
      }
      await applyMove(renaming.path, childPath(parentDirPath(renaming.path), trimmed), "file-tree.renameFailed");
    },
    [renaming, applyMove],
  );

  const submitMove = useCallback(
    (source: string, destination: string) => applyMove(source, destination, "file-tree.moveFailed"),
    [applyMove],
  );

  const requestDelete = useCallback(
    (item: TreeItem) => setDeleteTargets([{ name: item.name, path: item.path, type: item.type }]),
    [],
  );

  const requestDeleteMany = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setDeleteTargets(paths.map((path) => ({ name: path.split("/").pop() ?? path, path, type: "file" as const })));
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTargets || deleteTargets.length === 0) return;
    const targets = deleteTargets;
    setDeleteTargets(null);
    void (async () => {
      const results = await Promise.allSettled(targets.map((target) => client.deleteContent(target.path)));
      const succeeded: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeeded.push(targets[index].path);
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          toast.error(t("file-tree.deleteFailed", { message }));
        }
      });
      if (succeeded.length === 0) return;
      onDeleted?.(succeeded);
      for (const path of succeeded) {
        useDirtyPathsStore.getState().removePath(projectId, path);
      }
      setExpandedPaths((prev) => {
        const next = new Set<string>();
        let changed = false;
        for (const path of prev) {
          if (succeeded.some((deleted) => path === deleted || path.startsWith(`${deleted}/`))) {
            changed = true;
            continue;
          }
          next.add(path);
        }
        return changed ? next : prev;
      });
      for (const path of succeeded) {
        await invalidateProjectFileQueries(projectId, path);
      }
    })();
  }, [deleteTargets, client, onDeleted, projectId, t]);

  const cancelDelete = useCallback(() => setDeleteTargets(null), []);

  return {
    expandedPaths,
    creating,
    renaming,
    deleteTargets,
    dropTarget,
    toggleDir,
    expandDir,
    requestCreate,
    submitCreate,
    cancelCreate,
    requestRename,
    submitRename,
    cancelRename,
    submitMove,
    setDropTarget,
    requestDelete,
    requestDeleteMany,
    confirmDelete,
    cancelDelete,
  };
}
