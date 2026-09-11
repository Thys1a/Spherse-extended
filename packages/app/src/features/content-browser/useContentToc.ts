import { useEffect, useState, type RefObject } from "react";

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export function useContentToc(
  containerRef: RefObject<HTMLDivElement | null>,
  docKey: string,
  enabled: boolean,
): TocEntry[] {
  const [entries, setEntries] = useState<TocEntry[]>([]);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      return;
    }
    const root = containerRef.current?.querySelector("[data-content-doc]");
    if (!root) {
      setEntries([]);
      return;
    }
    const headings = root.querySelectorAll("h1[id], h2[id], h3[id]");
    setEntries(
      Array.from(headings).map((el) => ({
        id: el.id,
        text: el.textContent?.trim() ?? "",
        level: Number(el.tagName.slice(1)),
      })),
    );
  }, [containerRef, docKey, enabled]);

  return entries;
}
