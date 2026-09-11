import { useCallback, useEffect, useRef } from "react";
import { useTabStore } from "./tab-store";
import { useSplitStore, SPLIT_MIN_RATIO, SPLIT_MAX_RATIO } from "./split-store";
import { TabPanel } from "./TabPanel";
import { SplitContentPane } from "./SplitContentPane";

function SplitDivider({
  containerRef,
  ratio,
  onCommit,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  ratio: number;
  onCommit: (ratio: number) => void;
}) {
  const dragRef = useRef<{ startX: number; startRatio: number; width: number } | null>(null);

  const readRatio = (container: HTMLDivElement, fallback: number): number => {
    return Number(container.style.getPropertyValue("--split-ratio")) || fallback;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startRatio: readRatio(container, ratio), width };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const container = containerRef.current;
    if (!st || !container) return;
    const next = Math.min(
      SPLIT_MAX_RATIO,
      Math.max(SPLIT_MIN_RATIO, st.startRatio + (e.clientX - st.startX) / st.width),
    );
    container.style.setProperty("--split-ratio", String(next));
  };

  const onPointerUp = () => {
    const st = dragRef.current;
    const container = containerRef.current;
    dragRef.current = null;
    if (st && container) {
      onCommit(readRatio(container, st.startRatio));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    onCommit(ratio + (e.key === "ArrowRight" ? 0.05 : -0.05));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={Math.round(SPLIT_MIN_RATIO * 100)}
      aria-valuemax={Math.round(SPLIT_MAX_RATIO * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="w-1 shrink-0 cursor-col-resize bg-border/50 hover:bg-border focus-visible:bg-border"
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

  const showMain = tabs.length > 0;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-row">
      {showMain && (
        <>
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flexBasis: "calc(var(--split-ratio, 0.5) * 100%)" }}
          >
            {main}
          </div>
          <SplitDivider containerRef={containerRef} ratio={split.ratio} onCommit={handleDividerCommit} />
        </>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SplitContentPane projectId={projectId} filePath={split.filePath} />
      </div>
    </div>
  );
}
