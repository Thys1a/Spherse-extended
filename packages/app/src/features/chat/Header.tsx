import type { AgentSummary } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { cn } from "../../lib/utils";
import { CompactButton } from "./CompactButton";

interface HeaderProps {
  agent: AgentSummary;
  quickLinks?: string[];
  activeQuickLink?: string | null;
  onQuickLink?: (path: string) => void;
  onClose?: () => void;
  onCompact?: () => void;
  compacting?: boolean;
  compactDisabled?: boolean;
}

function basename(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const match = name.match(/^(.+)\.[^.]+$/);
  return match ? match[1] : name;
}

export function Header({ agent, quickLinks, activeQuickLink, onQuickLink, onClose, onCompact, compacting, compactDisabled }: HeaderProps) {
  const { t } = useI18n();
  const links = quickLinks?.filter((p, i, arr) => arr.indexOf(p) === i) ?? [];
  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3" data-chat-header>
      <span className="font-semibold text-[15px]">{agent.name}</span>
      {links.length > 0 && (
        <div
          className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          data-chat-quick-links
        >
          {links.map((path) => {
            const active = path === activeQuickLink;
            return (
              <Button
                key={path}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 shrink-0 px-2 text-[11px]",
                  active && "hover:bg-input",
                )}
                onClick={() => onQuickLink?.(path)}
                title={path}
              >
                {basename(path)}
              </Button>
            );
          })}
        </div>
      )}
      {onCompact && (
        <CompactButton
          compacting={compacting ?? false}
          disabled={compactDisabled ?? false}
          onCompact={onCompact}
          className={cn(links.length === 0 && "ml-auto", "text-muted-foreground")}
        />
      )}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={links.length > 0 || onCompact ? "" : "ml-auto"}
          onClick={onClose}
          title={t("chat.close")}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
