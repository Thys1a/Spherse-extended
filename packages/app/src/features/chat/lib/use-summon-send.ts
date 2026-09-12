import { useCallback } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import { useProjectCtx } from "../../../context/project-context";
import { useApiClient } from "../../../lib/use-connection";
import { useStreamingStore } from "../runtime/streaming-store";
import { parseSummonMessage } from "./slash-menu";

export function useSummonSend(sessionId: string, agentId: string) {
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const { t } = useI18n();

  return useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed.startsWith(">>")) return false;
      const summon = parseSummonMessage(trimmed);
      if (!summon) {
        toast.error(t("chat.summonUsage"));
        return true;
      }
      try {
        await client.summonToAgent(agentId, sessionId, summon);
        useStreamingStore.getState().refreshHistory(client, agentId, sessionId);
      } catch (err) {
        toast.error(t("chat.summonFailed", { message: (err as Error).message }));
      }
      return true;
    },
    [client, sessionId, agentId, t],
  );
}
