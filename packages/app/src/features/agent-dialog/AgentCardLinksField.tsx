import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { XIcon } from "lucide-react";
import type { ApiClient } from "../../lib/api";
import type { CardLinkListResponse } from "@spherse/contracts";
import { SearchFileField } from "./SearchFileField";
import { HintLabel } from "./HintLabel";

export function AgentCardLinksField({
  agentId,
  client,
  contextWindow,
}: {
  agentId: string;
  client: ApiClient;
  contextWindow?: number;
}) {
  const { t } = useI18n();
  const [links, setLinks] = useState<CardLinkListResponse>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLinks(await client.listAgentCardLinks(agentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, agentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = useCallback(
    async (path: string) => {
      try {
        await client.addAgentCardLink(agentId, path);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, agentId, reload],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      try {
        await client.removeAgentCardLink(agentId, name);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, agentId, reload],
  );

  const totals = links.reduce(
    (acc, link) => ({
      always: acc.always + (link.dangling ? 0 : link.alwaysTokens),
      max: acc.max + (link.dangling ? 0 : link.maxTurnTokens),
    }),
    { always: 0, max: 0 },
  );
  const ratio =
    contextWindow && contextWindow > 0 && totals.max > 0
      ? Math.round((totals.max / contextWindow) * 100)
      : null;

  return (
    <Field>
      <HintLabel hint={t("agent-dialog.cardLinksHint")}>{t("agent-dialog.cardLinksLabel")}</HintLabel>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {links.map((link) => (
            <Badge key={link.name} variant="secondary" className="gap-1">
              {link.dangling ? t("agent-dialog.cardLinksDangling", { name: link.name }) : link.target}
              {!link.dangling && (
                <span className="text-muted-foreground">
                  {t("agent-dialog.cardLinksTokens", {
                    count: String(link.entryCount),
                    always: link.alwaysTokens.toLocaleString(),
                    max: link.maxTurnTokens.toLocaleString(),
                  })}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mr-1 size-4"
                onClick={() => void handleRemove(link.name)}
              >
                <XIcon />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      {links.some((link) => !link.dangling) && (
        <p className="text-xs text-muted-foreground mb-2">
          {ratio !== null
            ? t("agent-dialog.cardLinksTotalWithRatio", {
                tAlways: totals.always.toLocaleString(),
                tMax: totals.max.toLocaleString(),
                ratio: String(ratio),
              })
            : t("agent-dialog.cardLinksTotal", {
                tAlways: totals.always.toLocaleString(),
                tMax: totals.max.toLocaleString(),
              })}
        </p>
      )}
      <SearchFileField
        exclude={links.map((link) => link.target)}
        onSelect={(path) => void handleAdd(path)}
        placeholder={t("agent-dialog.cardLinksPlaceholder")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Field>
  );
}
