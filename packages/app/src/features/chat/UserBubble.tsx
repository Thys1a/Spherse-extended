import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import { ChevronRightIcon, PencilIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { ChatAttachment } from "./types";
import type { UserSlash, UserSummon } from "./model/entry";
import { MarkdownContent } from "../../components/markdown-content/MarkdownContent";
import { CopyButton } from "./CopyButton";
import { MessageAttachments } from "./MessageAttachments";
import { SendFailedBar } from "./SendFailedBar";
import { WithdrawButton } from "./WithdrawButton";
import { formatMessageTime } from "./lib/format-time";
import { useOpenExternalLink } from "../browser/open-external-url";
import { SelectionMenu } from "./SelectionMenu";
import { useSelectionMenu } from "./hooks/useSelectionMenu";

const EDIT_MIN_HEIGHT = 2 * 20 + 16;
const EDIT_MAX_HEIGHT = 10 * 20 + 16;

interface UserBubbleProps {
  text: string;
  attachments?: ChatAttachment[];
  sendFailed?: boolean;
  timestamp?: number;
  showTime?: boolean;
  slash?: UserSlash;
  summon?: UserSummon;
  onWithdraw?: () => void;
  onRetry?: () => void;
  onEdit?: (text: string) => void;
  onOpenSession?: (sessionId: string) => void;
}

export function UserBubble({
  text,
  attachments,
  sendFailed,
  timestamp,
  showTime,
  slash,
  summon,
  onWithdraw,
  onRetry,
  onEdit,
  onOpenSession,
}: UserBubbleProps) {
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

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const canEdit = onEdit !== undefined;
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  useLayoutEffect(() => {
    if (!editing) return;
    const textarea = editRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const target = Math.max(EDIT_MIN_HEIGHT, Math.min(textarea.scrollHeight, EDIT_MAX_HEIGHT));
    textarea.style.height = `${target}px`;
    textarea.style.overflowY = textarea.scrollHeight > EDIT_MAX_HEIGHT ? "auto" : "hidden";
  }, [editing, editDraft]);

  const handleStartEdit = useCallback(() => {
    setEditDraft(text);
    setEditing(true);
  }, [text]);

  const handleConfirmEdit = useCallback(() => {
    if (editDraft.trim() === "" || editDraft.trim() === text.trim()) {
      setEditing(false);
      return;
    }
    onEdit?.(editDraft);
    setEditing(false);
  }, [editDraft, text, onEdit]);

  return (
    <div
      className="group max-w-[90%] min-w-0 flex items-start gap-1.5 self-end flex-row-reverse"
      data-chat-message
      data-role="user"
    >
      <div className="flex min-w-0 flex-col gap-1 items-end md:flex-row-reverse md:items-end md:gap-1.5">
        <div
          data-chat-bubble
          ref={bubbleRef}
          onContextMenu={handleContextMenu}
          className="max-w-full min-w-0 overflow-hidden rounded-lg px-3.5 py-2.5 leading-7 break-words bg-primary text-primary-foreground"
        >
          <div className="text-sm">
            {slash && (
              <span className="mb-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                /{slash.type}:{slash.name}
              </span>
            )}
            {editing ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <textarea
                  ref={editRef}
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  data-chat-edit-draft
                />
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditing(false)}
                  >
                    {t("chat.editCancel")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleConfirmEdit}
                    data-chat-edit-confirm
                  >
                    {t("chat.editConfirm")}
                  </Button>
                </div>
              </div>
            ) : (
              <MarkdownContent variant="chat" plain linkClassName="text-inherit" onLinkClick={handleLinkClick}>{text}</MarkdownContent>
            )}
          </div>
          {attachments && attachments.length > 0 && (
            <MessageAttachments attachments={attachments} />
          )}
          {summon?.sessionId && onOpenSession && (
            <button
              type="button"
              onClick={() => onOpenSession(summon.sessionId)}
              title={t("chat.summonCard", { name: summon.agentName })}
              className="mt-2 flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <span>{t("chat.summonCard", { name: summon.agentName })}</span>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        {sendFailed && <SendFailedBar onRetry={onRetry} />}
        <div className="flex items-center gap-1 pb-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:flex-row-reverse">
          {onWithdraw && <WithdrawButton onWithdraw={onWithdraw} />}
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={handleStartEdit}
              title={t("chat.editTooltip")}
              data-chat-edit
            >
              <PencilIcon />
            </Button>
          )}
          <CopyButton text={text} />
          {showTime && timestamp && (
            <time className="text-[11px] text-muted-foreground whitespace-nowrap">
              {formatMessageTime(timestamp)}
            </time>
          )}
        </div>
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
