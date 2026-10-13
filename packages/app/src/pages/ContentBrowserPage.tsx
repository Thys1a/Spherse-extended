import { useNavigate, useSearchParams } from "react-router";
import { ContentBrowser } from "../features/content-browser";
import { useProjectCtx } from "../context/project-context";
import { useProjectNavigation } from "../lib/use-project-navigation";

export function ContentBrowserPage() {
  const { projectId } = useProjectCtx();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { back } = useProjectNavigation();

  const filePath = searchParams.get("path");

  if (!filePath) {
    navigate(`/project/${projectId}`, { replace: true });
    return null;
  }

  return (
    <ContentBrowser
      key={filePath}
      filePath={filePath}
      onBack={back}
      onClose={() => navigate(`/project/${projectId}`, { replace: true })}
    />
  );
}
