import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { SidePanel } from "../features/side-panel";
import { useCustomTheme } from "../hooks/useCustomTheme";
import { useAgentBusRefresh } from "../hooks/useAgentBusRefresh";
import { useSidePanel } from "../hooks/use-side-panel";
import { useAppStore } from "../stores/app-store";
import { useProjectNavHistory } from "../lib/use-project-navigation";
import { useFeature } from "../lib/use-feature";
import { TabStrip, TabContainer, useTabStore } from "../features/tabs";
import { tabToRoute, routeToTabSpec } from "../features/tabs/tab-route";
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
  const projecting = useRef(false);
  const activeTabId = useTabStore((s) => (projectId ? s.byProject[projectId]?.activeTabId ?? null : null));
  const project = useAppStore((s) => (projectId ? s.projects.get(projectId) : undefined));
  const client = useApiClient(projectId);
  const connection = useConnection();
  const initializing = useAppStore((s) => s.initializing);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const setProjectLastRoute = useAppStore((s) => s.setProjectLastRoute);
  const { clickAwayProps } = useSidePanel();
  useCustomTheme(
    project?.path,
    connection.baseUrl,
    projectId,
    connection.accessToken,
  );
  useProjectNavHistory(projectId ?? "");
  useAgentBusRefresh(projectId, client);
  useEffect(() => {
    if (projectId) void setActiveProject(bridge, projectId);
  }, [projectId, setActiveProject, bridge]);

  useEffect(() => {
    if (!projectId) return;
    const fullPath = location.pathname + location.search;
    const prefix = `/project/${projectId}`;
    const subRoute = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) || "/" : "/";
    void setProjectLastRoute(projectId, subRoute);
  }, [location.pathname, location.search, projectId, setProjectLastRoute]);

  useEffect(() => {
    if (!tabsEnabled || !projectId) return;
    if (projecting.current) {
      projecting.current = false;
      return;
    }
    const spec = routeToTabSpec(projectId, location.pathname, location.search);
    if (spec) useTabStore.getState().openTab(projectId, spec);
  }, [tabsEnabled, projectId, location.pathname, location.search]);

  useEffect(() => {
    if (!tabsEnabled || !projectId || !activeTabId) return;
    const tab = useTabStore.getState().byProject[projectId]?.tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const route = tabToRoute(tab);
    const current = location.pathname + location.search;
    if (route !== current) {
      projecting.current = true;
      navigate(route, { replace: true });
    }
  }, [tabsEnabled, projectId, activeTabId, location.pathname, location.search, navigate]);

  if (!projectId || !project) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-muted-foreground">
        {initializing ? t("common.loading") : t("pages.projectNotFound")}
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
            <Outlet />
          )}
        </main>
        <ProjectRuntimeBridges />
      </div>
    </ProjectProvider>
  );
}
