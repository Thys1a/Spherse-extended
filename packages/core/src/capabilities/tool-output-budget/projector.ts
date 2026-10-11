import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextProjector } from "../../kernel/capability.js";
import { MAX_OUTPUT_CHARS } from "../../tools/output-limits.js";

const BUDGET_NOTICE = "…（工具结果超出 32KB 上下文预算，已截断）";

interface TextBlock {
  type?: unknown;
  text?: unknown;
}

export const toolOutputBudgetProjector: ContextProjector = () => {
  return (messages) => {
    const projected: AgentMessage[] = [];
    let changed = false;
    for (const message of messages) {
      if (message.role !== "toolResult") {
        projected.push(message);
        continue;
      }
      const content = (message as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        projected.push(message);
        continue;
      }
      let used = 0;
      let capped = false;
      const next: unknown[] = [];
      for (const block of content) {
        const textBlock = block as TextBlock;
        if (capped) {
          if (textBlock.type === "text") continue;
          next.push(block);
          continue;
        }
        if (textBlock.type !== "text" || typeof textBlock.text !== "string") {
          next.push(block);
          continue;
        }
        if (used + textBlock.text.length <= MAX_OUTPUT_CHARS) {
          used += textBlock.text.length;
          next.push(block);
          continue;
        }
        next.push({
          ...(block as Record<string, unknown>),
          text: `${textBlock.text.slice(0, MAX_OUTPUT_CHARS - used)}\n${BUDGET_NOTICE}`,
        });
        capped = true;
        used = MAX_OUTPUT_CHARS;
      }
      if (!capped) {
        projected.push(message);
        continue;
      }
      changed = true;
      projected.push({ ...message, content: next } as AgentMessage);
    }
    return changed ? projected : [...messages];
  };
};
