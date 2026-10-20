import { useI18n } from "@spherse/i18n/react";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { useProjectSessionStatus } from "../../queries/project/sessions";

export function SessionTokensPill({ sessionId, agentId }: { sessionId: string; agentId: string }) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const status = useProjectSessionStatus(projectId, client, agentId, sessionId);
  const data = status.data;
  if (!data) return null;
  const limit = data.contextWindowLimit;
  const ratio =
    limit !== null && limit > 0
      ? Math.min(100, Math.round((data.currentTokens / limit) * 100))
      : null;
  return (
    <span
      className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
      title={t("session.statusTitle")}
    >
      {data.currentTokens.toLocaleString()}
      {limit !== null && <> / {limit.toLocaleString()}</>}
      {ratio !== null && <> · {ratio}%</>}
    </span>
  );
}
