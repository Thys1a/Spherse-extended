import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import type { ProviderCatalogContract } from "@spherse/contracts";
import { ChevronDownIcon } from "lucide-react";
import { useProjectCtx } from "../../context/project-context";
import { useHostBridge } from "../../context/host-bridge-context";
import { useApiClient } from "../../lib/use-connection";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  updateProjectSessionModel,
  useProjectAgents,
  useProjectSession,
} from "../../queries/project";

interface ModelOption {
  id: string;
  label: string;
}

interface ModelGroup {
  providerId: string;
  providerName: string;
  models: ModelOption[];
}

function resolveModelDisplay(
  id: string,
  catalog: ProviderCatalogContract | null,
): { modelName: string; providerName: string | null } {
  const slashIdx = id.indexOf("/");
  if (slashIdx < 0 || !catalog) return { modelName: id, providerName: null };
  const provider = catalog[id.slice(0, slashIdx)];
  const model = provider?.models.find((m) => m.id === id.slice(slashIdx + 1));
  if (!model) return { modelName: id, providerName: null };
  return { modelName: model.name, providerName: provider.name };
}

export function SessionModelPill({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const bridge = useHostBridge();
  const sessionQuery = useProjectSession(projectId, client, sessionId);
  const { agents } = useProjectAgents(projectId, client);
  const [catalog, setCatalog] = useState<ProviderCatalogContract | null>(null);
  const [configuredIds, setConfiguredIds] = useState<Set<string>>(new Set());
  const [globalDefault, setGlobalDefault] = useState("");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [providers, settings] = await Promise.all([
          client.getSupportedProviders(),
          bridge.getSettings(),
        ]);
        if (cancelled) return;
        setCatalog(providers ?? null);
        const entries = Object.entries(settings?.models?.text?.providers ?? {});
        setConfiguredIds(
          new Set(entries.filter(([, def]) => def.apiKey?.trim()).map(([id]) => id)),
        );
        setGlobalDefault(settings?.models?.text?.defaultModel ?? "");
      } catch {
        if (!cancelled) setCatalog(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, bridge]);

  const session = sessionQuery.data ?? null;
  const agent = session ? agents.find((a) => a.id === session.agentId) : undefined;
  const effective = session?.model ?? agent?.model ?? globalDefault;

  const options: ModelGroup[] = [];
  if (catalog) {
    for (const [providerId, provider] of Object.entries(catalog)) {
      if (!configuredIds.has(providerId) && !provider.keyless) continue;
      if (provider.models.length === 0) continue;
      options.push({
        providerId,
        providerName: provider.name,
        models: provider.models.map((model) => ({
          id: `${providerId}/${model.id}`,
          label: model.name,
        })),
      });
    }
  }

  const { modelName, providerName } = effective
    ? resolveModelDisplay(effective, catalog)
    : { modelName: "", providerName: null };

  const handleSelect = (modelId: string) => {
    if (!session || switching) return;
    setSwitching(true);
    void updateProjectSessionModel(projectId, client, session, modelId)
      .catch((err: unknown) => {
        toast.error(t("chat.modelPill.switchFailed", { message: (err as Error).message }));
      })
      .finally(() => {
        setSwitching(false);
      });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            title={t("chat.modelPill.switchModel")}
            disabled={!session || switching}
          />
        }
      >
        <span className="max-w-48 truncate">
          {effective ? modelName : t("chat.modelPill.followDefault")}
        </span>
        {effective && providerName ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">· {providerName}</span>
        ) : null}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleSelect("")}>
          {t("chat.modelPill.followDefault")}
        </DropdownMenuItem>
        {options.map((group) => (
          <DropdownMenuGroup key={group.providerId}>
            <DropdownMenuLabel>{group.providerName}</DropdownMenuLabel>
            {group.models.map((option) => (
              <DropdownMenuItem key={option.id} onClick={() => handleSelect(option.id)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
