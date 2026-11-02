import { useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { Button } from "../../components/ui/button";
import type { ApiClient } from "../../lib/api";
import type { CompactResult } from "./model/entry-state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findLatestDigest(events: { type: string; data: unknown }[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const data = events[i].data;
    if (events[i].type === "compaction/applied" && isRecord(data) && typeof data.digestContent === "string") {
      return data.digestContent;
    }
  }
  return null;
}

export function CompactionBanner({
  result,
  sessionId,
  agentId,
  client,
  onDismiss,
}: {
  result: CompactResult;
  sessionId: string;
  agentId: string;
  client: Pick<ApiClient, "getSessionEvents"> | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestFailed, setDigestFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const count = result.excludedCount ?? 0;

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && digest === null && !digestFailed && !loading) {
      if (!client) {
        setDigestFailed(true);
        return;
      }
      setLoading(true);
      client
        .getSessionEvents(agentId, sessionId)
        .then((log) => {
          const found = findLatestDigest(log.events);
          if (found === null) setDigestFailed(true);
          else setDigest(found);
        })
        .catch(() => {
          setDigestFailed(true);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  return (
    <div
      data-chat-compaction-banner
      data-testid="compaction-banner"
      className="shrink-0 border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          {result.applied ? t("chat.compactBannerTitle", { count }) : t("chat.compactNotNeeded")}
        </span>
        {result.applied && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={toggleExpand}>
            {expanded ? t("chat.compactBannerCollapse") : t("chat.compactBannerExpand")}
            <ChevronDownIcon
              className="size-3 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 px-0"
          aria-label={t("chat.compactBannerClose")}
          onClick={onDismiss}
        >
          <XIcon className="size-3" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
          {digest}
          {loading && <span className="animate-pulse">…</span>}
          {digestFailed && <span>{t("chat.compactBannerDigestFailed")}</span>}
        </div>
      )}
    </div>
  );
}
