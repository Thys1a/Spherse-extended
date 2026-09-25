import { useMemo, useEffect, useRef, useState } from "react";
import type { AgentSummary } from "../../lib/types";
import { useNavigate } from "react-router";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient, useConnection } from "../../lib/use-connection";
import { useFeature } from "../../lib/use-feature";
import { useIsMobile } from "../../hooks/use-mobile";
import { useProjectAgentProfile } from "../../queries/project";
import { useFloatingContentBrowserStore } from "../floating-content-browser/store";
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
import { QuickLinkPanel, resolveQuickLinkAction } from "./QuickLinkPanel";
import { ChatAgentProvider } from "./chat-agent-context";
import { useAgentTheme } from "./hooks/useAgentTheme";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatSession } from "./hooks/useChatSession";
import type { AttachedFile } from "./types";
import { useSummonSend } from "./lib/use-summon-send";
import { FindBar } from "../../components/find-bar/FindBar";

export interface ChatProps {
  sessionId: string;
  agent: AgentSummary;
  onNavigateToPath?: (path: string) => void;
  onOpenSession?: (sessionId: string) => void;
  initialMessage?: string;
  onClose?: () => void;
  hideHeader?: boolean;
}

export function Chat({ sessionId, agent, onNavigateToPath, onOpenSession, initialMessage, onClose, hideHeader }: ChatProps) {
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const { baseUrl, accessToken } = useConnection();
  const { t, locale } = useI18n();
  const bridge = useHostBridge();
  const autoRead = useSettingsStore((s) => s.tts.autoRead ?? false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const floatEnabled = useFeature("floating-content-browser");
  const openFloat = useFloatingContentBrowserStore((s) => s.openFloat);
  const profileQuery = useProjectAgentProfile(projectId, client, agent.id, !hideHeader);
  const quickLinks = useMemo(() => profileQuery.data?.quickLinks ?? [], [profileQuery.data?.quickLinks]);
  const [activeQuickLink, setActiveQuickLink] = useState<string | null>(null);
  const {
    entries,
    groups,
    supersededToolCallIds,
    thinking,
    runningGroupId,
    withdrawableUserId,
    streaming,
    loading,
    connection,
    historyError,
    hasMore,
    loadingMore,
    sendMessage,
    retry,
    withdrawLastTurn,
    abort,
    reconnect,
    retryHistory,
    respondApproval,
    respondQuestion,
    loadMore,
  } = useChatSession({
    client,
    sessionId,
    baseUrl,
    projectId,
    agentId: agent.id,
    initialMessage,
    accessToken,
  });
  const { containerRef, isAtBottom, scrollToBottom } = useChatScroll(entries, sessionId, loadingMore);
  const themeHref = useAgentTheme(client, agent.id, agent.slug, projectId);
  const [findOpen, setFindOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        const active = document.activeElement;
        if (!rootRef.current || !active || !rootRef.current.contains(active)) return;
        event.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  const sendSummon = useSummonSend(sessionId, agent.id);

  const handleSend = (text: string, attachments?: AttachedFile[]) => {
    if (text.trim().startsWith(">>")) {
      if (attachments && attachments.length > 0) {
        toast.error(t("chat.summonNoAttachments"));
        return false;
      }
      void sendSummon(text);
      return true;
    }
    const image = attachments?.find((a) => a.kind === "image");
    return sendMessage(
      text,
      image
        ? {
            path: image.path,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            previewUrl: image.previewUrl,
          }
        : undefined,
    );
  };

  const agentScope = useMemo(() => ({ sessionId, agentId: agent.id }), [sessionId, agent.id]);

  useEffect(() => {
    if (activeQuickLink !== null && !quickLinks.includes(activeQuickLink)) {
      setActiveQuickLink(null);
    }
  }, [quickLinks, activeQuickLink]);

  const handleQuickLink = (path: string) => {
    const action = resolveQuickLinkAction(isMobile, floatEnabled);
    if (action === "panel") {
      setActiveQuickLink((current) => (current === path ? null : path));
      return;
    }
    if (action === "float") {
      openFloat(projectId, path);
      return;
    }
    navigate(`/project/${projectId}/content?path=${encodeURIComponent(path)}`);
  };

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
    <ChatAgentProvider agent={agentScope}>
      <div ref={rootRef} className="flex flex-col h-full" data-chat-root>
        {themeHref && <link rel="stylesheet" href={themeHref} />}
        {!hideHeader && (
          <div className="relative shrink-0">
            <Header
              agent={agent}
              quickLinks={quickLinks.length > 0 ? quickLinks : undefined}
              activeQuickLink={isMobile ? activeQuickLink : null}
              onQuickLink={handleQuickLink}
              onClose={onClose ? handleClose : undefined}
            />
            {isMobile && activeQuickLink !== null && (
              <QuickLinkPanel projectId={projectId} path={activeQuickLink} />
            )}
          </div>
        )}
        <ConnectionBanner
          state={connection.state}
          historyError={historyError}
          onReconnect={reconnect}
          onRetryHistory={retryHistory}
        />
        {findOpen && (
          <FindBar
            containerRef={containerRef}
            contentKey={sessionId}
            onClose={() => setFindOpen(false)}
          />
        )}
        <MessageList
          groups={groups}
          agent={agent}
          thinking={thinking}
          runningGroupId={runningGroupId}
          withdrawableUserId={withdrawableUserId}
          supersededToolCallIds={supersededToolCallIds}
          greeting={profileQuery.data?.greeting}
          loading={loading}
          containerRef={containerRef}
          isAtBottom={isAtBottom}
          onScrollToBottom={() => scrollToBottom("smooth")}
          onNavigateToPath={onNavigateToPath}
          onRespondApproval={handleRespondApproval}
          onRespondQuestion={handleRespondQuestion}
          onRetry={retry}
          onWithdraw={withdrawLastTurn}
          allowInlineHtml={profileQuery.data?.allowInlineHtml}
          onOpenSession={onOpenSession}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
        <Composer
          streaming={streaming}
          loading={loading}
          panicLocked={false}
          sessionId={sessionId}
          placeholder={profileQuery.data?.placeholder}
          onSend={handleSend}
          onAbort={abort}
        />
      </div>
    </ChatAgentProvider>
  );
}
