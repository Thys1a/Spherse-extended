import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { ProjectProvider } from "../context/project-context";
import { useHostBridge } from "../context/host-bridge-context";
import { useAppStore } from "../stores/app-store";
import { useApiClient, useConnection } from "../lib/use-connection";
import { useCustomTheme } from "../hooks/useCustomTheme";
import { useAgentBusRefresh, useSessionBusRefresh } from "../hooks/useAgentBusRefresh";
import { ApiError } from "../lib/api";

export function FloatProjectScope() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const bridge = useHostBridge();
  const connection = useConnection();
  const client = useApiClient(projectId);
  const ensureProject = useAppStore((s) => s.ensureProject);
  const project = useAppStore((s) => s.projects.get(projectId));
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useCustomTheme(project?.path, connection.baseUrl, projectId, connection.accessToken);
  useAgentBusRefresh(projectId, client);
  useSessionBusRefresh(projectId);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    ensureProject(bridge, projectId).then(
      (resolved) => {
        if (!cancelled && !resolved) setFailed(true);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          void bridge.floatWindow?.closeSelf({ forget: true }).catch(() => undefined);
          return;
        }
        setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bridge, projectId, ensureProject, retry]);

  if (!project) {
    if (!failed) {
      return (
        <div className="flex h-full flex-1 items-center justify-center text-muted-foreground">
          <p>{t("common.loading")}</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>{t("pages.projectNotFound")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => setRetry((r) => r + 1)}
          >
            {t("common.retry")}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => {
              void bridge.floatWindow?.closeSelf().catch(() => undefined);
            }}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={projectId} projectRoot={project.path}>
      <Outlet />
    </ProjectProvider>
  );
}
