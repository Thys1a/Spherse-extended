import { ContentBrowser } from "../content-browser";
import { useTabStore } from "./tab-store";
import { useSplitStore } from "./split-store";

export function SplitContentPane({ projectId, filePath }: { projectId: string; filePath: string }) {
  const closeSplit = useSplitStore((s) => s.closeSplit);
  const setFile = useSplitStore((s) => s.setFile);

  const returnToMain = () => {
    const entry = useTabStore.getState().byProject[projectId];
    const tabs = entry?.tabs ?? [];
    const existing =
      tabs.find((t) => t.id === entry?.activeTabId && t.kind === "content" && t.filePath === filePath) ??
      tabs.find((t) => t.kind === "content" && t.filePath === filePath);
    if (existing) {
      useTabStore.getState().activate(projectId, existing.id);
    } else {
      useTabStore.getState().openTab(
        projectId,
        { kind: "content", label: filePath.split("/").pop() ?? filePath, filePath },
        { force: true },
      );
    }
    closeSplit(projectId);
  };

  return (
    <ContentBrowser
      key={filePath}
      filePath={filePath}
      onBack={() => closeSplit(projectId)}
      onClose={() => closeSplit(projectId)}
      onNavigate={(path) => setFile(projectId, path)}
      onUnsplit={returnToMain}
    />
  );
}
