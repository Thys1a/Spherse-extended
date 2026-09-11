import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

export interface FileTreeSelection {
  selected: ReadonlySet<string>;
  anchor: string | null;
  selectFileWithModifiers: (e: MouseEvent, filePath: string) => void;
  selectSingle: (filePath: string) => void;
  clearSelection: () => void;
}

function readVisibleOrder(container: HTMLElement | null): string[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll("[data-path]"))
    .map((el) => el.getAttribute("data-path"))
    .filter((p): p is string => p !== null);
}

export function useFileTreeSelection(
  containerRef: RefObject<HTMLDivElement | null>,
  projectId: string,
  onSelectFile: (filePath: string) => void,
): FileTreeSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const onSelectFileRef = useRef(onSelectFile);
  useEffect(() => {
    onSelectFileRef.current = onSelectFile;
  });

  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
  }, [projectId]);

  const selectSingle = useCallback((filePath: string) => {
    setSelected(new Set([filePath]));
    setAnchor(filePath);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const selectFileWithModifiers = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      if (e.shiftKey) {
        const order = readVisibleOrder(containerRef.current);
        const anchorIdx = anchor !== null ? order.indexOf(anchor) : -1;
        const clickedIdx = order.indexOf(filePath);
        if (anchorIdx !== -1 && clickedIdx !== -1) {
          const [from, to] = anchorIdx < clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
          setSelected(new Set(order.slice(from, to + 1)));
          return;
        }
        selectSingle(filePath);
        onSelectFileRef.current(filePath);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(filePath)) {
            next.delete(filePath);
          } else {
            next.add(filePath);
          }
          return next;
        });
        setAnchor(filePath);
        return;
      }
      selectSingle(filePath);
      onSelectFileRef.current(filePath);
    },
    [anchor, containerRef, selectSingle],
  );

  return { selected, anchor, selectFileWithModifiers, selectSingle, clearSelection };
}
