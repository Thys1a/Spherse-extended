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
  DropdownMenuItem,
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

function modelLabel(id: string, catalog: ProviderCatalogContract | null): string {
  const slashIdx = id.indexOf("/");
  if (slashIdx < 0 || !catalog) return id;
  const provider = catalog[id.slice(0, slashIdx)];
  const model = provider?.models.find((m) => m.id === id.slice(slashIdx + 1));
  return model?.name ?? id;
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

  const options: ModelOption[] = [];
  if (catalog) {
    for (const [providerId, provider] of Object.entries(catalog)) {
      if (!configuredIds.has(providerId) && !provider.keyless) continue;
      for (const model of provider.models) {
        options.push({ id: `${providerId}/${model.id}`, label: model.name });
      }
    }
  }

  const handleSelect = (modelId: string) => {
    if (!session) return;
    void updateProjectSessionModel(projectId, client, session, modelId).catch((err: unknown) => {
      toast.error(t("chat.modelPill.switchFailed", { message: (err as Error).message }));
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
            disabled={!session}
          />
        }
      >
        <span className="max-w-48 truncate">
          {effective ? modelLabel(effective, catalog) : t("chat.modelPill.followDefault")}
        </span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleSelect("")}>
          {t("chat.modelPill.followDefault")}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onClick={() => handleSelect(option.id)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
