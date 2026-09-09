import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTabStore } from "./tab-store";
import { tabToRoute, routeToTabSpec } from "./tab-route";

export function useTabRouteSync(projectId: string | undefined, enabled: boolean): void {
  const location = useLocation();
  const navigate = useNavigate();
  const projectedRoute = useRef<string | null>(null);
  const activeTabId = useTabStore((s) => (projectId ? s.byProject[projectId]?.activeTabId ?? null : null));

  useEffect(() => {
    if (!enabled || !projectId) return;
    const current = location.pathname + location.search;
    if (projectedRoute.current !== null && projectedRoute.current === current) {
      projectedRoute.current = null;
      return;
    }
    const spec = routeToTabSpec(projectId, location.pathname, location.search);
    if (spec) useTabStore.getState().openTab(projectId, spec);
  }, [enabled, projectId, location.pathname, location.search]);

  useEffect(() => {
    if (!enabled || !projectId || !activeTabId) return;
    const tab = useTabStore.getState().byProject[projectId]?.tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const route = tabToRoute(tab);
    const current = location.pathname + location.search;
    if (route !== current) {
      projectedRoute.current = route;
      navigate(route, { replace: true });
    }
  }, [enabled, projectId, activeTabId, location.pathname, location.search, navigate]);
}
