import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import { ChevronRightIcon, PencilIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { AgentSummary } from "../../lib/types";
import type { ChatMessage } from "./types";
import { MarkdownContent } from "../../components/markdown-content/MarkdownContent";
import { HtmlCardRenderer } from "./HtmlCard";
import { ImageCardRenderer } from "./ImageCard";
import { CommandCardRenderer } from "./CommandCard";
import { ApprovalCardRenderer } from "./ApprovalCard";
import { QuestionCardRenderer } from "./QuestionCard";
import { ToolCallSection } from "./ToolCallSection";
import { CopyButton } from "./CopyButton";
import { ErrorMessageSection } from "./ErrorMessageSection";
import { FileViewerCard } from "./FileViewerCard";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { MessageAttachments } from "./MessageAttachments";
import { SendFailedBar } from "./SendFailedBar";
import { WithdrawButton } from "./WithdrawButton";
import { SpeakButton } from "./SpeakButton";
import { SelectionMenu } from "./SelectionMenu";
import { useComposerInsertStore } from "./composer-insert-store";
import { useStreamingStore } from "./runtime/streaming-store";
import { useOpenExternalLink } from "../browser/open-external-url";
import { formatMessageTime } from "./lib/format-time";
import { quoteFenceFor } from "./lib/quote-fence";

const EDIT_MIN_HEIGHT = 2 * 20 + 16;
const EDIT_MAX_HEIGHT = 10 * 20 + 16;

interface MessageItemProps {
  message: ChatMessage;
  agent: AgentSummary;
  showTime?: boolean;
  sessionId?: string;
  supersededToolCallIds?: Set<string>;
  onNavigateToPath?: (path: string) => void;
  onRespondApproval?: (requestId: string, approved: boolean) => void;
  onRespondQuestion?: (requestId: string, answer: string) => boolean | void;
  onRetry?: () => void;
  onWithdraw?: () => void;
  onOpenSession?: (sessionId: string) => void;
  editable?: boolean;
}

export function MessageItem({ message, agent, showTime, sessionId, supersededToolCallIds, onNavigateToPath, onRespondApproval, onRespondQuestion, onRetry, onWithdraw, onOpenSession, editable }: MessageItemProps) {
  const isUser = message.role === "user";
  const openLink = useOpenExternalLink();
  const { t } = useI18n();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const canEdit = editable && sessionId != null && !message._streaming;

  useLayoutEffect(() => {
    if (!editing) return;
    const textarea = editRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const target = Math.max(EDIT_MIN_HEIGHT, Math.min(textarea.scrollHeight, EDIT_MAX_HEIGHT));
    textarea.style.height = `${target}px`;
    textarea.style.overflowY = textarea.scrollHeight > EDIT_MAX_HEIGHT ? "auto" : "hidden";
  }, [editing, editDraft]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (
      !text.trim() ||
      !bubbleRef.current ||
      !selection?.anchorNode ||
      !selection.focusNode ||
      !bubbleRef.current.contains(selection.anchorNode) ||
      !bubbleRef.current.contains(selection.focusNode)
    ) {
      setMenu(null);
      return;
    }
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text });
  }, []);

  const handleCopySelection = useCallback(() => {
    const text = menu?.text;
    setMenu(null);
    if (!text) return;
    if (!navigator.clipboard) {
      toast.error(t("chat.selectionMenu.copyFailed"));
      return;
    }
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .catch(() => {
        toast.error(t("chat.selectionMenu.copyFailed"));
      });
  }, [menu, t]);

  const handleQuoteSelection = useCallback(() => {
    if (menu && sessionId) {
      const fence = quoteFenceFor(menu.text);
      useComposerInsertStore
        .getState()
        .requestInsert(sessionId, `${fence}quoted\n${menu.text}\n${fence}`);
    }
    setMenu(null);
  }, [menu, sessionId]);

  const handleStartEdit = useCallback(() => {
    setEditDraft(message.content);
    setEditing(true);
  }, [message.content]);

  const handleConfirmEdit = useCallback(() => {
    if (sessionId && useStreamingStore.getState().editAndResend(sessionId, editDraft)) {
      setEditing(false);
    }
  }, [sessionId, editDraft]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleCloseMenu = useCallback(() => setMenu(null), []);

  const handleLinkClick = useCallback(
    async (href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) return;
      event.preventDefault();
      if (href.startsWith("#")) {
        if (href.length > 1) {
          document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      openLink(href);
    },
    [openLink],
  );

  return (
    <div
      className={`group max-w-[90%] min-w-0 flex items-start gap-1.5 ${isUser ? "self-end flex-row-reverse" : "self-start flex-row"}`}
      data-chat-message
      data-role={message.role}
    >
      <div
        className={`flex min-w-0 flex-col gap-1 ${isUser ? "items-end md:flex-row-reverse" : "items-start md:flex-row"} md:items-end md:gap-1.5`}
      >
      <div
        ref={bubbleRef}
        data-chat-bubble
        onContextMenu={handleContextMenu}
        className={`max-w-full min-w-0 overflow-hidden rounded-lg px-3.5 py-2.5 leading-7 break-words ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-card-foreground"
        }`}
      >
        <div className="text-[11px] font-semibold mb-1 opacity-70">
          {message.role === "assistant" && (agent.alias || agent.name)}
        </div>
        <div className="text-sm">
          {message._slash && (
            <span className="mb-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              /{message._slash.type}:{message._slash.name}
            </span>
          )}
          {message._streaming && message.content === "" ? (
            <ThinkingIndicator />
          ) : editing ? (
            <div className="flex min-w-52 flex-col gap-2">
              <textarea
                ref={editRef}
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                autoFocus
                className="w-full resize-y rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                >
                  {t("chat.editCancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirmEdit}
                  disabled={!editDraft.trim()}
                >
                  {t("chat.editConfirm")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownContent variant="chat" plain={isUser} linkClassName="text-inherit" onLinkClick={handleLinkClick}>{message.content}</MarkdownContent>
              {message._streaming && message.content && <span className="animate-[blink_1s_step-end_infinite]">|</span>}
            </>
          )}
        </div>
        {isUser && message._attachments && message._attachments.length > 0 && (
          <MessageAttachments attachments={message._attachments} />
        )}
        {isUser && message._summon?.sessionId && onOpenSession && (
          <button
            type="button"
            onClick={() => onOpenSession(message._summon!.sessionId)}
            title={t("chat.summonCard", { name: message._summon.agentName ?? message._summon.agentId })}
            className="mt-2 flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
          >
            <span>{t("chat.summonCard", { name: message._summon.agentName ?? message._summon.agentId })}</span>
            <ChevronRightIcon className="size-3.5 text-muted-foreground" />
          </button>
        )}
        {message._toolCalls && message._toolCalls.length > 0 && (
          <ToolCallSection toolCalls={message._toolCalls} onNavigateToPath={onNavigateToPath} />
        )}
        {message._error && <ErrorMessageSection error={message._error} errorCode={message._errorCode} onRetry={message._withdrawError ? undefined : onRetry} />}
        {message._toolCalls
          ?.filter((toolCall) => toolCall._card)
          .map((toolCall) => {
            const card = toolCall._card!;
            if (card.type === "html") {
              return (
                <HtmlCardRenderer
                  key={toolCall.toolCallId}
                  card={card}
                  defaultCollapsed={supersededToolCallIds?.has(toolCall.toolCallId) ?? false}
                />
              );
            }
            if (card.type === "command") {
              return <CommandCardRenderer key={toolCall.toolCallId} card={card} onRespondApproval={onRespondApproval} />;
            }
            if (card.type === "approval") {
              return <ApprovalCardRenderer key={toolCall.toolCallId} card={card} onRespondApproval={onRespondApproval} />;
            }
            if (card.type === "image") {
              return <ImageCardRenderer key={toolCall.toolCallId} card={card} />;
            }
            if (card.type === "question") {
              return <QuestionCardRenderer key={toolCall.toolCallId} card={card} onRespondQuestion={onRespondQuestion} />;
            }
            return null;
          })}
        {message._runChanges && message._runChanges.length > 0 && (
          <div className="mt-5">
            {message._runChanges.map((change) => (
              <FileViewerCard key={change.path} change={change} onNavigateToPath={onNavigateToPath} />
            ))}
          </div>
        )}
      </div>
        {isUser && message._sendFailed && <SendFailedBar onRetry={onRetry} />}
        {!message._streaming && (
          <div className={`flex items-center gap-1 pb-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 ${isUser ? "md:flex-row-reverse" : ""}`}>
            {isUser && onWithdraw && <WithdrawButton onWithdraw={onWithdraw} />}
            {isUser && canEdit && !editing && (
              <button
                type="button"
                onClick={handleStartEdit}
                title={t("chat.editTooltip")}
                aria-label={t("chat.editTooltip")}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PencilIcon className="size-3.5" />
              </button>
            )}
            {!isUser && message._messageId != null && (
              <SpeakButton messageId={String(message._messageId)} text={message.content} sessionId={sessionId} />
            )}
            <CopyButton text={message.content} />
            {showTime && message.timestamp && (
              <time className="text-[11px] text-muted-foreground whitespace-nowrap">
                {formatMessageTime(message.timestamp)}
              </time>
            )}
          </div>
        )}
      </div>
      {menu && (
        <SelectionMenu
          x={menu.x}
          y={menu.y}
          canQuote={sessionId != null}
          onCopy={handleCopySelection}
          onQuote={handleQuoteSelection}
          onClose={handleCloseMenu}
        />
      )}
    </div>
  );
}
