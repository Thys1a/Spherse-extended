import { useCallback, useMemo } from "react";
import { useI18n } from "@spherse/i18n/react";
import type { AgentSummary } from "../../lib/types";
import type { FileChangeCard, HtmlCard } from "./types";
import type { EntryDiagnostics, EntryError } from "./model/entry";
import type { ToolItem } from "./model/tool-item";
import { MarkdownContent } from "../../components/markdown-content/MarkdownContent";
import { CopyButton } from "./CopyButton";
import { ErrorMessageSection } from "./ErrorMessageSection";
import { FileViewerCard } from "./FileViewerCard";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ToolItemView } from "./ToolItemView";
import { HtmlCardRenderer } from "./HtmlCard";
import { ImageCardRenderer } from "./ImageCard";
import { CommandCardRenderer } from "./CommandCard";
import { ApprovalCardRenderer } from "./ApprovalCard";
import { QuestionCardRenderer } from "./QuestionCard";
import { formatMessageTime } from "./lib/format-time";
import { useOpenExternalLink } from "../browser/open-external-url";
import { SelectionMenu } from "./SelectionMenu";
import { useSelectionMenu } from "./hooks/useSelectionMenu";
import { SpeakButton } from "./SpeakButton";
import { extractHtmlFenceBlocks, stripHtmlFences } from "./lib/html-fence-parser";
import { CodeBlock } from "../../components/markdown-content/CodeBlock";

interface AssistantBubbleProps {
  agent: AgentSummary;
  text: string;
  tools: ToolItem[];
  streaming?: boolean;
  error?: EntryError;
  timestamp?: number;
  runChanges?: FileChangeCard[];
  thinking?: string;
  thinkingTruncated?: boolean;
  diagnostics?: EntryDiagnostics;
  showTime?: boolean;
  supersededToolCallIds?: Set<string>;
  onNavigateToPath?: (path: string) => void;
  onRespondApproval?: (requestId: string, approved: boolean) => void;
  onRespondQuestion?: (requestId: string, answer: string) => boolean | void;
  onRetry?: () => void;
  allowInlineHtml?: boolean;
  messageId?: string;
}

export function AssistantBubble({
  agent,
  text,
  tools,
  streaming,
  error,
  timestamp,
  runChanges,
  thinking,
  thinkingTruncated,
  diagnostics,
  showTime,
  supersededToolCallIds,
  onNavigateToPath,
  onRespondApproval,
  onRespondQuestion,
  onRetry,
  allowInlineHtml,
  messageId,
}: AssistantBubbleProps) {
  const { t } = useI18n();
  const openLink = useOpenExternalLink();
  const {
    bubbleRef,
    menu,
    sessionId,
    handleContextMenu,
    handleCopySelection,
    handleQuoteSelection,
    handleCloseMenu,
  } = useSelectionMenu();

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

  const cards = tools.filter((tool) => tool.card);

  const inlineHtml = useMemo(() => {
    if (streaming || allowInlineHtml !== true) {
      return null;
    }
    const blocks = extractHtmlFenceBlocks(text);
    if (blocks.length === 0) return null;
    return { blocks, content: stripHtmlFences(text) };
  }, [streaming, text, allowInlineHtml]);
  const displayText = inlineHtml?.content ?? text;

  return (
    <div
      className="group max-w-[90%] min-w-0 flex items-start gap-1.5 self-start flex-row"
      data-chat-message
      data-role="assistant"
    >
      <div className="flex min-w-0 flex-col gap-1 items-start md:flex-row md:items-end md:gap-1.5">
        <div
          data-chat-bubble
          ref={bubbleRef}
          onContextMenu={handleContextMenu}
          className="max-w-full min-w-0 overflow-hidden rounded-lg px-3.5 py-2.5 leading-7 break-words border border-border bg-card text-card-foreground"
        >
          <div className="text-[11px] font-semibold mb-1 opacity-70">
            {agent.alias || agent.name}
          </div>
          {thinking && (
            <details className="mb-2 overflow-hidden rounded-lg border border-border" data-chat-thinking>
              <summary className="cursor-pointer bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                {thinkingTruncated
                  ? t("chat.thinking.titleTruncated", { count: thinking.length })
                  : t("chat.thinking.title", { count: thinking.length })}
              </summary>
              <div className="flex items-start gap-1 p-3">
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">{thinking}</div>
                <CopyButton text={thinking} />
              </div>
            </details>
          )}
          <div className="text-sm">
            {streaming && text === "" ? (
              <ThinkingIndicator />
            ) : (
              <>
                <MarkdownContent variant="chat" linkClassName="text-inherit" onLinkClick={handleLinkClick}>{displayText}</MarkdownContent>
                {streaming && text && <span className="animate-[blink_1s_step-end_infinite]">|</span>}
              </>
            )}
          </div>
          {inlineHtml?.blocks.map((block, blockIndex) => {
            const card: HtmlCard = { type: "html", html: block.source };
            return (
              <div key={`syn-html-${blockIndex}`} className="mt-2">
                <details className="mb-2 overflow-hidden rounded-lg border border-border">
                  <summary className="cursor-pointer bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                    {t("chat.inlineHtmlSource")}
                  </summary>
                  <CodeBlock className="overflow-x-auto rounded-none bg-muted p-3 font-mono text-xs">
                    <code>{block.source}</code>
                  </CodeBlock>
                </details>
                <HtmlCardRenderer card={card} injectSdk={false} />
              </div>
            );
          })}
          {tools.length > 0 && (
            <div className="mt-2 border-t border-dashed border-border pt-2">
              {tools.map((tool) => (
                <ToolItemView
                  key={tool.toolCallId}
                  tool={tool}
                  onNavigateToPath={onNavigateToPath}
                />
              ))}
            </div>
          )}
          {error && (
            <ErrorMessageSection
              error={error.message}
              errorCode={error.code}
              diagnostics={diagnostics}
              onRetry={error.retrySuppressed ? undefined : onRetry}
            />
          )}
          {cards.map((tool) => {
            const card = tool.card!;
            if (card.type === "html") {
              return (
                <HtmlCardRenderer
                  key={tool.toolCallId}
                  card={card}
                  defaultCollapsed={supersededToolCallIds?.has(tool.toolCallId) ?? false}
                />
              );
            }
            if (card.type === "command") {
              return <CommandCardRenderer key={tool.toolCallId} card={card} onRespondApproval={onRespondApproval} />;
            }
            if (card.type === "approval") {
              return <ApprovalCardRenderer key={tool.toolCallId} card={card} onRespondApproval={onRespondApproval} />;
            }
            if (card.type === "image") {
              return <ImageCardRenderer key={tool.toolCallId} card={card} />;
            }
            if (card.type === "question") {
              return <QuestionCardRenderer key={tool.toolCallId} card={card} onRespondQuestion={onRespondQuestion} />;
            }
            return null;
          })}
          {runChanges && runChanges.length > 0 && (
            <div className="mt-5">
              {runChanges.map((change) => (
                <FileViewerCard key={change.path} change={change} onNavigateToPath={onNavigateToPath} />
              ))}
            </div>
          )}
        </div>
        {!streaming && (
          <div className="flex items-center gap-1 pb-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
            <CopyButton text={text} />
            {messageId && <SpeakButton messageId={messageId} text={displayText} sessionId={sessionId ?? undefined} />}
            {showTime && timestamp && (
              <time className="text-[11px] text-muted-foreground whitespace-nowrap">
                {formatMessageTime(timestamp)}
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
