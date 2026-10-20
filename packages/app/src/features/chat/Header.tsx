import type { AgentSummary } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { SearchIcon, XIcon } from "lucide-react";
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
  onFind?: () => void;
}

function basename(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const match = name.match(/^(.+)\.[^.]+$/);
  return match ? match[1] : name;
}

function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac/i.test(platform);
}

export function Header({ agent, quickLinks, activeQuickLink, onQuickLink, onClose, onCompact, compacting, compactDisabled, onFind }: HeaderProps) {
  const { t } = useI18n();
  const links = quickLinks?.filter((p, i, arr) => arr.indexOf(p) === i) ?? [];
  const findTitle = `${t("chat.find.open")} (${isMacPlatform() ? "⌘F" : "Ctrl+F"})`;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2" data-chat-header>
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
      {onFind && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(links.length === 0 && !onCompact && "ml-auto", "text-muted-foreground")}
          onClick={onFind}
          title={findTitle}
          aria-label={findTitle}
        >
          <SearchIcon className="size-3.5" />
        </Button>
      )}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={links.length > 0 || onCompact || onFind ? "" : "ml-auto"}
          onClick={onClose}
          title={t("chat.close")}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
