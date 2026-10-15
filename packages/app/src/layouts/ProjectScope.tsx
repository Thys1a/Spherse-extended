import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { SidePanel } from "../features/side-panel";
import { Button } from "../components/ui/button";
import { GlobalSearchDialog } from "../features/global-search";
import { useCustomTheme } from "../hooks/useCustomTheme";
import { useAgentBusRefresh, useSessionBusRefresh } from "../hooks/useAgentBusRefresh";
import { useSidePanel } from "../hooks/use-side-panel";
import { useAppStore } from "../stores/app-store";
import { useAppUiStore } from "../stores/app-ui-store";
import { useProjectNavHistory } from "../lib/use-project-navigation";
import { useFeature } from "../lib/use-feature";
import { TabStrip, TabContainer } from "../features/tabs";
import { useTabRouteSync } from "../features/tabs/use-tab-route-sync";
import { stripMessageId } from "../lib/route-params";
import { ProjectProvider } from "../context/project-context";
import { useHostBridge } from "../context/host-bridge-context";
import { useApiClient } from "../lib/use-connection";
import { useConnection } from "../lib/use-connection";
import { ProjectRuntimeBridges } from "./ProjectRuntimeBridges";

export function ProjectScope() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const bridge = useHostBridge();
  const tabsEnabled = useFeature("tabs");
  useTabRouteSync(projectId, tabsEnabled);
  const project = useAppStore((s) => (projectId ? s.projects.get(projectId) : undefined));
  const client = useApiClient(projectId);
  const connection = useConnection();
  const initializing = useAppStore((s) => s.initializing);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const setProjectLastRoute = useAppStore((s) => s.setProjectLastRoute);
  const globalSearchOpen = useAppUiStore((s) => s.globalSearchOpen);
  const setGlobalSearchOpen = useAppUiStore((s) => s.setGlobalSearchOpen);
  const { clickAwayProps } = useSidePanel();
  useCustomTheme(
    project?.path,
    connection.baseUrl,
    projectId,
    connection.accessToken,
  );
  useProjectNavHistory(projectId ?? "");
  useAgentBusRefresh(projectId, client);
  useSessionBusRefresh(projectId);
  useEffect(() => {
    if (projectId) void setActiveProject(bridge, projectId);
  }, [projectId, setActiveProject, bridge]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setGlobalSearchOpen(false);
    };
  }, [setGlobalSearchOpen]);

  useEffect(() => {
    if (!projectId) return;
    const fullPath = stripMessageId(location.pathname, location.search);
    const prefix = `/project/${projectId}`;
    const subRoute = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) || "/" : "/";
    void setProjectLastRoute(projectId, subRoute);
  }, [location.pathname, location.search, projectId, setProjectLastRoute]);

  if (!projectId || !project) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>{initializing ? t("common.loading") : t("pages.projectNotFound")}</p>
        {!initializing && projectId && bridge.kind === "web" && (
          <Button variant="outline" onClick={() => navigate("/", { replace: true })}>
            {t("pages.projectNotFoundBackToConnect")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <ProjectProvider projectId={projectId} projectRoot={project.path}>
      <div className="relative flex h-full flex-1 overflow-hidden">
        <SidePanel />
        <main
          className="flex-1 overflow-hidden flex flex-col"
          {...clickAwayProps}
        >
          {tabsEnabled ? (
            <>
              <TabStrip projectId={projectId} />
              <TabContainer projectId={projectId} />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          )}
        </main>
        {globalSearchOpen && <GlobalSearchDialog />}
        <ProjectRuntimeBridges />
      </div>
    </ProjectProvider>
  );
}
