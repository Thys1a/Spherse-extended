import { useState } from "react";
import type { QuickReply } from "@spherse/core";
import { useI18n } from "@spherse/i18n/react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { PencilIcon, XIcon } from "lucide-react";
import { MAX_QUICK_REPLIES, MAX_QUICK_REPLY_LABEL_LENGTH } from "./agent-markdown";

export function QuickReplyManagerDialog({
  replies,
  onChange,
  onClose,
}: {
  replies: QuickReply[];
  onChange: (next: QuickReply[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftText, setDraftText] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const capped = replies.length >= MAX_QUICK_REPLIES && editingIndex === null;
  const canSubmit = draftLabel.trim() !== "" && draftText.trim() !== "";

  const resetDraft = () => {
    setDraftLabel("");
    setDraftDescription("");
    setDraftText("");
    setEditingIndex(null);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const description = draftDescription.trim();
    const entry: QuickReply = {
      label: draftLabel.trim().slice(0, MAX_QUICK_REPLY_LABEL_LENGTH),
      ...(description ? { description } : {}),
      text: draftText,
      action: "fill",
    };
    if (editingIndex === null) {
      if (capped) return;
      onChange([...replies, entry]);
    } else {
      onChange(replies.map((reply, index) => (index === editingIndex ? entry : reply)));
    }
    resetDraft();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEdit = (index: number) => {
    const target = replies[index];
    if (!target) return;
    setDraftLabel(target.label);
    setDraftDescription(target.description ?? "");
    setDraftText(target.text);
    setEditingIndex(index);
  };

  const handleRemove = (index: number) => {
    resetDraft();
    onChange(replies.filter((_, i) => i !== index));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("agent-dialog.quickRepliesDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {replies.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("agent-dialog.quickRepliesEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {replies.map((reply, index) => (
                <li
                  key={`${reply.label}-${index}`}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={reply.label}>
                      {reply.label}
                    </span>
                    <span
                      className="block truncate text-[11px] text-muted-foreground"
                      title={reply.description ?? reply.text}
                    >
                      {reply.description ?? reply.text}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("common.edit")}
                    onClick={() => handleEdit(index)}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("common.delete")}
                    onClick={() => handleRemove(index)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <Input
                type="text"
                value={draftLabel}
                maxLength={MAX_QUICK_REPLY_LABEL_LENGTH}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder={t("agent-dialog.quickReplyLabelPlaceholder")}
                className="w-28 shrink-0"
                onKeyDown={handleKeyDown}
              />
              <Input
                type="text"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder={t("agent-dialog.quickReplyDescriptionPlaceholder")}
                className="min-w-0 flex-1"
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex gap-1.5">
              <Input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t("agent-dialog.quickReplyTextPlaceholder")}
                className="min-w-0 flex-1"
                onKeyDown={handleKeyDown}
              />
              {editingIndex === null ? (
                <Button type="button" variant="outline" size="sm" disabled={!canSubmit || capped} onClick={handleSubmit}>
                  {t("agent-dialog.quickRepliesAdd")}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
                    {t("agent-dialog.quickReplyUpdate")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
                    {t("common.cancel")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("agent-dialog.quickRepliesDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
