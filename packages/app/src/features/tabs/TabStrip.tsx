import { useRef } from "react";
import { X } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { useApiClient } from "../../lib/use-connection";
import { useProjectCatalog } from "../../queries/project";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { useTabStore } from "./tab-store";

export function TabStrip({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const entry = useTabStore((s) => s.byProject[projectId]);
  const client = useApiClient(projectId);
  const { sessions } = useProjectCatalog(projectId, client);
  const activate = useTabStore((s) => s.activate);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeOthers = useTabStore((s) => s.closeOthers);
  const closeAll = useTabStore((s) => s.closeAll);
  const reorder = useTabStore((s) => s.reorder);
  // Drag source by tab id (not list index): the strip renders home tabs
  // pinned outside the scroll container, so indices are region-local.
  const dragFromId = useRef<string | null>(null);

  const tabs = entry?.tabs ?? [];
  const activeTabId = entry?.activeTabId ?? null;
  const homeTabs = tabs.filter((t) => t.kind === "home");
  const scrollTabs = tabs.filter((t) => t.kind !== "home");

  const handleDrop = (targetId: string) => {
    const fromId = dragFromId.current;
    dragFromId.current = null;
    if (!fromId || fromId === targetId) return;
    const from = tabs.find((t) => t.id === fromId);
    const target = tabs.find((t) => t.id === targetId);
    if (!from || !target) return;
    // Cross-region drops (home <-> scroll) are a no-op: pinned tabs stay pinned.
    if ((from.kind === "home") !== (target.kind === "home")) return;
    const fromIdx = tabs.findIndex((t) => t.id === fromId);
    const toIdx = tabs.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    reorder(projectId, fromIdx, toIdx);
  };

  const renderTab = (tab: (typeof tabs)[number]) => {
    const active = tab.id === activeTabId;
    const title =
      tab.kind === "chat" && tab.sessionId
        ? sessions.find((s) => s.id === tab.sessionId)?.title || tab.label || t("tabs.home")
        : tab.label || t("tabs.home");
    return (
      <ContextMenu key={tab.id}>
        <ContextMenuTrigger>
          <div
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={() => {
              dragFromId.current = tab.id;
            }}
            onDragEnd={() => {
              dragFromId.current = null;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(tab.id)}
            onClick={() => activate(projectId, tab.id)}
            className={
              active
                ? "flex max-w-48 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 border-border bg-muted px-2.5 py-1.5 text-sm"
                : "flex max-w-48 cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
            }
          >
            <span className="truncate">{title}</span>
            <button
              type="button"
              aria-label={t("tabs.closeTab")}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(projectId, tab.id);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => closeTab(projectId, tab.id)}>
            {t("tabs.closeTab")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => closeOthers(projectId, tab.id)}>
            {t("tabs.closeOthers")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => closeAll(projectId)}>
            {t("tabs.closeAll")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div role="tablist" aria-label={t("tabs.list")} className="flex shrink-0 items-stretch gap-1 border-b border-border px-2 pt-1.5">
      {homeTabs.map((tab) => renderTab(tab))}
      <div data-tab-scroll className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden">
        {scrollTabs.map((tab) => renderTab(tab))}
      </div>
    </div>
  );
}
