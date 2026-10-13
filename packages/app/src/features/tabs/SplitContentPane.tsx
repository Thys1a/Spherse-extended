import { ContentBrowser } from "../content-browser";
import { useSplitStore } from "./split-store";

export function SplitContentPane({ projectId, filePath }: { projectId: string; filePath: string }) {
  const closeSplit = useSplitStore((s) => s.closeSplit);
  const setFile = useSplitStore((s) => s.setFile);

  return (
    <ContentBrowser
      key={filePath}
      filePath={filePath}
      onBack={() => closeSplit(projectId)}
      onClose={() => closeSplit(projectId)}
      onNavigate={(path) => setFile(projectId, path)}
    />
  );
}
