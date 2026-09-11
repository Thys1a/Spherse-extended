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
  const dragFrom = useRef<number | null>(null);

  const tabs = entry?.tabs ?? [];
  const activeTabId = entry?.activeTabId ?? null;

  return (
    <div role="tablist" aria-label={t("tabs.list")} className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border px-2 pt-1.5">
      {tabs.map((tab, idx) => {
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
                  dragFrom.current = idx;
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom.current !== null) {
                    reorder(projectId, dragFrom.current, idx);
                    dragFrom.current = null;
                  }
                }}
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
      })}
    </div>
  );
}
