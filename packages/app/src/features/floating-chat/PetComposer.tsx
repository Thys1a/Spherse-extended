import { useState } from "react";
import { SendIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient, useConnection } from "../../lib/use-connection";
import { useChatSession } from "../chat/hooks/useChatSession";
import { useSummonSend } from "../chat/lib/use-summon-send";

export function PetComposer({ sessionId, agentId }: { sessionId: string; agentId: string }) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const { baseUrl, accessToken } = useConnection();
  const { sendMessage, streaming, loading } = useChatSession({
    client,
    sessionId,
    baseUrl,
    projectId,
    agentId,
    accessToken,
  });
  const sendSummon = useSummonSend(sessionId, agentId);
  const [input, setInput] = useState("");
  const busy = streaming || loading;

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    void sendSummon(text).then((consumed) => {
      if (consumed) {
        setInput("");
        return;
      }
      if (sendMessage(text)) setInput("");
    });
  };

  return (
    <form
      className="flex items-center gap-1 border-t border-border p-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={t("chat.composerPlaceholder")}
        aria-label={t("chat.composerPlaceholder")}
        disabled={busy}
        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!input.trim() || busy}
        title={t("chat.send")}
        aria-label={t("chat.send")}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
      >
        <SendIcon className="size-3.5" />
      </button>
    </form>
  );
}
