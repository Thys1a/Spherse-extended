import { useState } from "react";
import type { QuickReply } from "@spherse/core";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { HintLabel } from "./HintLabel";
import { XIcon } from "lucide-react";
import { MAX_QUICK_REPLIES, MAX_QUICK_REPLY_LABEL_LENGTH } from "./agent-markdown";

export function QuickReplyField({
  replies,
  onAdd,
  onRemove,
  label,
  hint,
  labelPlaceholder,
  descriptionPlaceholder,
  textPlaceholder,
  addLabel,
}: {
  replies: QuickReply[];
  onAdd: (reply: QuickReply) => void;
  onRemove: (index: number) => void;
  label: string;
  hint: string;
  labelPlaceholder: string;
  descriptionPlaceholder: string;
  textPlaceholder: string;
  addLabel: string;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftText, setDraftText] = useState("");
  const capped = replies.length >= MAX_QUICK_REPLIES;
  const canAdd = !capped && draftLabel.trim() !== "" && draftText !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      label: draftLabel.trim().slice(0, MAX_QUICK_REPLY_LABEL_LENGTH),
      ...(draftDescription ? { description: draftDescription } : {}),
      text: draftText,
      action: "fill",
    });
    setDraftLabel("");
    setDraftDescription("");
    setDraftText("");
  };

  return (
    <Field>
      <HintLabel hint={hint}>{label}</HintLabel>
      {replies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {replies.map((reply, index) => (
            <Badge
              key={`${reply.label}-${index}`}
              variant="secondary"
              className="gap-1"
              title={reply.description ?? reply.text}
            >
              {reply.label}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mr-1 size-4"
                onClick={() => onRemove(index)}
              >
                <XIcon />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Input
            type="text"
            value={draftLabel}
            maxLength={MAX_QUICK_REPLY_LABEL_LENGTH}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder={labelPlaceholder}
            className="w-28 shrink-0"
          />
          <Input
            type="text"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder={descriptionPlaceholder}
            className="min-w-0 flex-1"
          />
        </div>
        <div className="flex gap-1.5">
          <Input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={textPlaceholder}
            className="min-w-0 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={handleAdd}>
            {addLabel}
          </Button>
        </div>
      </div>
    </Field>
  );
}
