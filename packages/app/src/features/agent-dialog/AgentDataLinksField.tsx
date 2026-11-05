import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { XIcon } from "lucide-react";
import type { ApiClient } from "../../lib/api";
import type { DataLinkListResponse } from "@spherse/contracts";
import { SearchFileField } from "./SearchFileField";
import { HintLabel } from "./HintLabel";

export function AgentDataLinksField({
  agentId,
  client,
  contextWindow,
}: {
  agentId: string;
  client: ApiClient;
  contextWindow?: number;
}) {
  const { t } = useI18n();
  const [links, setLinks] = useState<DataLinkListResponse>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLinks(await client.listAgentDataLinks(agentId));
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
        await client.addAgentDataLink(agentId, path);
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
        await client.removeAgentDataLink(agentId, name);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, agentId, reload],
  );

  const total = links.reduce(
    (acc, link) => acc + (link.dangling || !link.hasState ? 0 : link.estimatedTokens),
    0,
  );
  const ratio =
    contextWindow && contextWindow > 0 && total > 0
      ? Math.round((total / contextWindow) * 100)
      : null;

  return (
    <Field>
      <HintLabel hint={t("agent-dialog.dataLinksHint")}>{t("agent-dialog.dataLinksLabel")}</HintLabel>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {links.map((link) => (
            <Badge key={link.name} variant="secondary" className="gap-1">
              {link.dangling ? t("agent-dialog.dataLinksDangling", { name: link.name }) : link.target}
              {!link.dangling && (
                <span className="text-muted-foreground">
                  {link.hasState
                    ? t("agent-dialog.dataLinksTokens", {
                        tokens: link.estimatedTokens.toLocaleString(),
                      })
                    : link.statePath
                      ? t("agent-dialog.dataLinksInactive", { path: link.statePath })
                      : t("agent-dialog.dataLinksNoState")}
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
      {links.some((link) => !link.dangling && link.hasState) && (
        <p className="text-xs text-muted-foreground mb-2">
          {ratio !== null
            ? t("agent-dialog.dataLinksTotalWithRatio", {
                total: total.toLocaleString(),
                ratio: String(ratio),
              })
            : t("agent-dialog.dataLinksTotal", {
                total: total.toLocaleString(),
              })}
        </p>
      )}
      <SearchFileField
        exclude={links.map((link) => link.target)}
        onSelect={(path) => void handleAdd(path)}
        placeholder={t("agent-dialog.dataLinksPlaceholder")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Field>
  );
}
