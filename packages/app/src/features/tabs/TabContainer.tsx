import { useTabStore } from "./tab-store";
import { TabPanel } from "./TabPanel";

export function TabContainer({ projectId }: { projectId: string }) {
  const entry = useTabStore((s) => s.byProject[projectId]);

  const tabs = entry?.tabs ?? [];
  const activeTabId = entry?.activeTabId ?? null;
  if (tabs.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="min-h-0 flex-1 flex-col"
          style={{ display: tab.id === activeTabId ? "flex" : "none" }}
        >
          <TabPanel projectId={projectId} tab={tab} />
        </div>
      ))}
    </div>
  );
}
