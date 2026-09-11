import { useMemo, useEffect } from "react";
import type { AgentSummary } from "../../lib/types";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient, useConnection } from "../../lib/use-connection";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import { stopIfSession } from "./tts/tts-controller";
import { speak } from "./tts/tts-controller";
import { onAssistantTurnComplete } from "./tts/bridge";
import { useHostBridge } from "../../context/host-bridge-context";
import { useSettingsStore } from "../../stores/settings-store";
import { Composer } from "./Composer";
import { Header } from "./Header";
import { MessageList } from "./MessageList";
import { ConnectionBanner } from "./ConnectionBanner";
import { ChatRuntimeProvider } from "./runtime-context";
import { useAgentTheme, scopeAgentThemeCss } from "./hooks/useAgentTheme";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatSession } from "./hooks/useChatSession";
import { useStreamingStore } from "./runtime/streaming-store";

export interface ChatProps {
  sessionId: string;
  agent: AgentSummary;
  onNavigateToPath?: (path: string) => void;
  initialMessage?: string;
  onClose?: () => void;
  hideHeader?: boolean;
}

export function Chat({ sessionId, agent, onNavigateToPath, initialMessage, onClose, hideHeader }: ChatProps) {
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const { baseUrl, accessToken } = useConnection();
  const { t, locale } = useI18n();
  const bridge = useHostBridge();
  const autoRead = useSettingsStore((s) => s.tts.autoRead ?? false);
  const {
    messages,
    streaming,
    loading,
    connectionStatus,
    historyError,
    reconnectFailed,
    sendMessage,
    retry,
    withdrawLastTurn,
    abort,
    reconnect,
    retryHistory,
    respondApproval,
    respondQuestion,
  } = useChatSession({
    client,
    sessionId,
    baseUrl,
    projectId,
    agentId: agent.id,
    initialMessage,
    accessToken,
  });
  const hasMore = useStreamingStore((s) => s.sessions[sessionId]?.hasMore ?? false);
  const loadingMore = useStreamingStore((s) => s.sessions[sessionId]?.loadingMore ?? false);
  const { containerRef, isAtBottom, scrollToBottom } = useChatScroll(messages, sessionId, loadingMore);
  const themeCss = useAgentTheme(client, agent.id, agent.slug, projectId);
  const scopedThemeCss = useMemo(
    () => (themeCss ? scopeAgentThemeCss(themeCss, sessionId) : ""),
    [themeCss, sessionId],
  );

  const handleClose = () => {
    onClose?.();
  };

  const handleRespondApproval = (requestId: string, approved: boolean) => {
    const delivered = respondApproval(requestId, approved);
    if (!delivered) toast.error(t("chat.approvalNotDelivered"));
  };

  const handleRespondQuestion = (requestId: string, answer: string): boolean => {
    const delivered = respondQuestion(requestId, answer);
    if (!delivered) toast.error(t("chat.questionNotDelivered"));
    return delivered;
  };

  const runtime = useMemo(() => ({ sessionId, agentId: agent.id }), [sessionId, agent.id]);

  useEffect(() => {
    stopIfSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!autoRead) return;
    return onAssistantTurnComplete((sid, text) => {
      if (sid !== sessionId || document.hidden) return;
      void (async () => {
        const settings = await bridge.getSettings();
        speak(`${sessionId}:auto`, sessionId, text, {
          voiceURI: settings?.tts?.voiceURI,
          rate: settings?.tts?.rate,
          locale,
        });
      })();
    });
  }, [autoRead, sessionId, bridge, locale]);

  return (
    <ChatRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-full" data-chat-root data-chat-instance={sessionId}>
        {scopedThemeCss && <style data-agent-theme={sessionId}>{scopedThemeCss}</style>}
        {!hideHeader && <Header agent={agent} onClose={onClose ? handleClose : undefined} />}
        <ConnectionBanner
          connectionStatus={connectionStatus}
          reconnectFailed={reconnectFailed}
          historyError={historyError}
          onReconnect={reconnect}
          onRetryHistory={retryHistory}
        />
        <MessageList
          messages={messages}
          agent={agent}
          sessionId={sessionId}
          streaming={streaming}
          loading={loading}
          containerRef={containerRef}
          isAtBottom={isAtBottom}
          onScrollToBottom={() => scrollToBottom("smooth")}
          onNavigateToPath={onNavigateToPath}
          onRespondApproval={handleRespondApproval}
          onRespondQuestion={handleRespondQuestion}
          onRetry={retry}
          onWithdraw={withdrawLastTurn}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => useStreamingStore.getState().loadMore(client, sessionId, agent.id)}
        />
        <Composer
          streaming={streaming}
          loading={loading}
          sessionId={sessionId}
          onSend={sendMessage}
          onAbort={abort}
        />
      </div>
    </ChatRuntimeProvider>
  );
}
