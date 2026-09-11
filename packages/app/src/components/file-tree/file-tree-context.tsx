import { createContext, useContext } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { ApiClient } from "../../lib/api";
import type { CreatingState, RenamingState, CreateAction, TreeItem } from "./tree-model";

export interface FileTreeContextValue {
  projectId: string;
  client: ApiClient;
  selectedFilePath?: string;
  expandedPaths: ReadonlySet<string>;
  creating: CreatingState | null;
  renaming: RenamingState | null;
  selectFile: (filePath: string) => void;
  selectedPaths: ReadonlySet<string>;
  selectFileWithModifiers: (e: MouseEvent, filePath: string) => void;
  selectSingle: (filePath: string) => void;
  toggleDir: (path: string) => void;
  expandDir: (path: string) => void;
  requestCreate: (item: TreeItem, action: CreateAction) => void;
  submitCreate: (parentPath: string, action: CreateAction, name: string) => void;
  cancelCreate: () => void;
  requestRename: (item: TreeItem) => void;
  submitRename: (name: string) => void;
  cancelRename: () => void;
  submitMove: (source: string, destination: string) => Promise<boolean>;
  dropTarget: string | null;
  setDropTarget: (path: string | null) => void;
  requestDelete: (item: TreeItem) => void;
  requestDeleteMany: (paths: string[]) => void;
  onOpenInNewTab?: (filePath: string) => void;
  onFloatFile?: (filePath: string) => void;
  floatedFilePaths?: Set<string>;
  readOnly?: boolean;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

export function FileTreeProvider({
  value,
  children,
}: {
  value: FileTreeContextValue;
  children: ReactNode;
}) {
  return <FileTreeContext.Provider value={value}>{children}</FileTreeContext.Provider>;
}

export function useFileTreeCtx(): FileTreeContextValue {
  const ctx = useContext(FileTreeContext);
  if (!ctx) {
    throw new Error("useFileTreeCtx must be used within FileTreeProvider");
  }
  return ctx;
}
