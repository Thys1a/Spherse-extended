import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextProjector } from "../../kernel/capability.js";

const KEEP_RECENT_SEGMENTS = 5;

interface TextBlock {
  type?: unknown;
  text?: unknown;
}

export function createPruningProjector(keepSegments: number = KEEP_RECENT_SEGMENTS): ContextProjector {
  const keep = Math.max(1, keepSegments);
  return () => {
    return (messages) => {
      const segOf: number[] = new Array(messages.length);
      let segments = 0;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "user") segments += 1;
        segOf[i] = segments;
      }
      const cutoff = segments - keep + 1;
      if (cutoff <= 1) return [...messages];
      let changed = false;
      const projected = messages.map((message, i) => {
        if (message.role !== "toolResult" || (segOf[i] as number) >= cutoff) return message;
        const content = (message as { content?: unknown }).content;
        if (!Array.isArray(content)) return message;
      let chars = 0;
      let hasText = false;
      for (const block of content) {
        const textBlock = block as TextBlock;
        if (textBlock.type !== "text" || typeof textBlock.text !== "string") continue;
        hasText = true;
        chars += textBlock.text.length;
      }
      if (!hasText) return message;
      changed = true;
      const toolName = (message as { toolName?: unknown }).toolName;
        return {
          ...message,
          content: [
            {
              type: "text",
              text: `[Output from ${typeof toolName === "string" ? toolName : "tool"} - ${chars} chars]`,
            },
          ],
        } as AgentMessage;
      });
      return changed ? projected : [...messages];
    };
  };
}

export const toolOutputPruningProjector: ContextProjector = createPruningProjector();
