import { useCallback, useEffect, useRef } from "react";
import { useTabStore } from "./tab-store";
import { useSplitStore, SPLIT_MIN_RATIO, SPLIT_MAX_RATIO } from "./split-store";
import { TabPanel } from "./TabPanel";
import { SplitContentPane } from "./SplitContentPane";

function SplitDivider({
  containerRef,
  onCommit,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onCommit: (ratio: number) => void;
}) {
  const dragRef = useRef<{ startX: number; startRatio: number; width: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;
    e.preventDefault();
    const startRatio = Number(container.style.getPropertyValue("--split-ratio")) || 0.5;
    dragRef.current = { startX: e.clientX, startRatio, width };
    const onMouseMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      const next = Math.min(
        SPLIT_MAX_RATIO,
        Math.max(SPLIT_MIN_RATIO, st.startRatio + (ev.clientX - st.startX) / st.width),
      );
      container.style.setProperty("--split-ratio", String(next));
    };
    const onMouseUp = () => {
      const st = dragRef.current;
      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (st) {
        onCommit(Number(container.style.getPropertyValue("--split-ratio")) || st.startRatio);
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-border/50 hover:bg-border"
    />
  );
}

export function TabContainer({ projectId }: { projectId: string }) {
  const entry = useTabStore((s) => s.byProject[projectId]);
  const split = useSplitStore((s) => s.byProject[projectId]);
  const setRatio = useSplitStore((s) => s.setRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const tabs = entry?.tabs ?? [];
  const activeTabId = entry?.activeTabId ?? null;

  useEffect(() => {
    containerRef.current?.style.setProperty("--split-ratio", String(split?.ratio ?? 0.5));
  }, [split?.ratio]);

  const handleDividerCommit = useCallback(
    (ratio: number) => {
      setRatio(projectId, ratio);
    },
    [projectId, setRatio],
  );

  const main = (
    <>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="min-h-0 flex-1 flex-col"
          style={{ display: tab.id === activeTabId ? "flex" : "none" }}
        >
          <TabPanel projectId={projectId} tab={tab} />
        </div>
      ))}
    </>
  );

  if (tabs.length === 0 && !split) return null;

  if (!split) {
    return <div className="flex min-h-0 flex-1 flex-col">{main}</div>;
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-row">
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ flexBasis: "calc(var(--split-ratio, 0.5) * 100%)" }}
      >
        {main}
      </div>
      <SplitDivider containerRef={containerRef} onCommit={handleDividerCommit} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SplitContentPane projectId={projectId} filePath={split.filePath} />
      </div>
    </div>
  );
}
