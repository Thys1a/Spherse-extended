import type { QuickReply } from "@spherse/core";
import { Button } from "../../components/ui/button";
import { useComposerInsertStore } from "./composer-insert-store";

export function QuickReplyBar({ sessionId, replies }: { sessionId: string; replies: QuickReply[] }) {
  if (replies.length === 0) return null;
  return (
    <div
      data-chat-quick-replies
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border bg-background px-3 py-1.5"
    >
      {replies.map((reply, index) => (
        <Button
          key={`${reply.label}-${index}`}
          type="button"
          variant="secondary"
          size="sm"
          className="h-6 max-w-40 shrink-0 px-2 text-[11px]"
          title={reply.description ?? reply.text}
          onClick={() => {
            useComposerInsertStore.getState().requestInsert(sessionId, reply.text);
          }}
        >
          <span className="truncate">{reply.label}</span>
        </Button>
      ))}
    </div>
  );
}
