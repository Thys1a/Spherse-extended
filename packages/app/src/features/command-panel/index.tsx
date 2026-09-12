import { useState } from "react";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "../../components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { useHostBridge } from "../../context/host-bridge-context";
import type { CommandDefinition } from "../../lib/types";
import { invalidateProjectCommandQueries, useProjectCommands } from "../../queries/commands";
import { CommandDialog } from "./CommandDialog";

export function CommandPanel() {
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const bridge = useHostBridge();
  const { t } = useI18n();
  const { data: commands = [] } = useProjectCommands(projectId, client);
  const [dialog, setDialog] = useState<{ command: CommandDefinition | null } | null>(null);

  const canEdit = bridge.capabilities.content.editable;

  const handleDelete = async (command: CommandDefinition) => {
    try {
      await client.deleteCommand(command.name);
      toast.success(t("command-panel.delete.success", { name: command.name }));
      await invalidateProjectCommandQueries(projectId);
    } catch (err) {
      toast.error(t("command-panel.delete.failed", { message: (err as Error).message }));
    }
  };

  const handleSaved = () => {
    void invalidateProjectCommandQueries(projectId);
  };

  return (
    <>
      <div className="border-b border-sidebar-border p-2">
        <SidebarGroup className="px-0 py-0">
          <SidebarGroupLabel className="h-7 px-0 text-[11px] font-semibold tracking-wide uppercase">
            {t("project-panel.commands")}
          </SidebarGroupLabel>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarGroupAction className="top-1 right-0" aria-label={t("command-panel.menu")} />}
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                <DropdownMenuItem onClick={() => setDialog({ command: null })}>
                  {t("command-panel.create")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <SidebarGroupContent>
            {commands.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("command-panel.empty")}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {commands.map((command) => (
                  <div
                    key={command.name}
                    className="group/cmd flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">/{`command:${command.name}`}</div>
                      {command.description && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {command.description}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/cmd:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title={t("command-panel.edit")}
                          onClick={() => setDialog({ command })}
                        >
                          <PencilIcon className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title={t("command-panel.delete")}
                          onClick={() => void handleDelete(command)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </div>
      <CommandDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        client={client}
        command={dialog?.command ?? null}
        onSaved={handleSaved}
      />
    </>
  );
}
