import { useEffect, useMemo, useRef, useState } from "react";
import { useBusSubscription } from "../../../hooks/useBusSubscription";
import { FileUpdateDebouncer, parseFileUpdate } from "../../../ui-sdk/event/file-update";
import { extractDataFileRefs } from "../html-data-refs";

export function useDataLinkedRefresh(
  projectId: string,
  ownFile: string | null,
  html: string | null,
): number {
  const [revision, setRevision] = useState(0);
  const paths = useMemo(() => {
    const next = new Set<string>();
    if (ownFile) next.add(ownFile.replace(/\\/g, "/"));
    for (const ref of extractDataFileRefs(html ?? "")) next.add(ref);
    return next;
  }, [ownFile, html]);
  const pathsRef = useRef(paths);
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);
  const debouncerRef = useRef<FileUpdateDebouncer | null>(null);
  useEffect(() => {
    const debouncer = new FileUpdateDebouncer();
    debouncerRef.current = debouncer;
    return () => {
      debouncer.clear();
      debouncerRef.current = null;
    };
  }, []);

  useBusSubscription(projectId, "fs-watch", (_type, payload) => {
    const event = parseFileUpdate(payload);
    if (!event) return;
    if (!pathsRef.current.has(event.path)) return;
    debouncerRef.current?.schedule(event, () => {
      setRevision((k) => k + 1);
    });
  });

  return revision;
}
