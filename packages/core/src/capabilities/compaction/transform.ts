import type { Agent } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { generateDigest, planCompaction, sanitizeDigestContent, sanitizeToolCallPairs, type CompactionPlan } from "../../context/compaction.js";
import { estimateTokens, readCurrentTokens } from "../../context/token-estimate.js";
import { isTruncatedTurn, readUsageTotal } from "../../context/truncated-turn.js";
import type { TurnEventAppender } from "../../kernel/turn-hooks.js";
import { deriveMessageEntries } from "../../session/fold.js";
import { summarizeForCompaction, type SummarizeDeps } from "./summarize.js";

const HARD_LIMIT_RATIO = 0.9;
const TARGET_RATIO = 0.5;

export interface ObservedWindowStore {
  get(): number | undefined;
  set(window: number): void;
}

export type MaybeCompactDeps = SummarizeDeps;
export async function maybeCompactLog(
  eventLog: TurnEventAppender,
  agent: Agent,
  sessionId: string,
  deps: MaybeCompactDeps,
  windowStore?: ObservedWindowStore,
): Promise<void> {
  const logger = deps.logger;
  const projected = deriveMessageEntries(eventLog.events as never);
  const messages = projected.map((entry) => entry.message as Message);

  const currentTokens = readCurrentTokens(messages, agent.state.systemPrompt);
  const configWindow =
    (agent.state.model as { contextWindow?: number } | undefined)?.contextWindow ?? 32768;
  const lastMessage: unknown = messages[messages.length - 1];
  const overflowed = isTruncatedTurn(lastMessage);
  const lastUsage = readUsageTotal(lastMessage);
  let contextWindow = windowStore?.get() ?? configWindow;
  if (overflowed && lastUsage !== undefined) {
    contextWindow = Math.min(contextWindow, Math.floor(lastUsage * 0.9));
    windowStore?.set(contextWindow);
  }

  const overrides = overflowed ? { thresholdRatio: 0, hardRatio: 0 } : {};
  const plan = planCompaction(messages, { currentTokens, contextWindow, ...overrides });
  if (!plan.shouldCompact) return;

  const build = (p: CompactionPlan) => {
    const anchorSeq = projected[p.anchorIndex]?.seq;
    if (anchorSeq === undefined) return undefined;
    const sanitized = sanitizeToolCallPairs(p.tail);
    const keptIndices = new Set(sanitized.keptIndices);
    const excludedSeqs = p.tail.flatMap((_, index) => {
      if (keptIndices.has(index)) return [];
      const seq = projected[p.anchorIndex + 1 + index]?.seq;
      return seq === undefined ? [] : [seq];
    });
    const postEstimate =
      estimateTokens(agent.state.systemPrompt) + estimateTokens(sanitized.messages);
    return { anchorSeq, sanitized, excludedSeqs, postEstimate };
  };

  let finalPlan = plan;
  let built = build(plan);
  if (!built) return;
  if (overflowed && built.postEstimate > contextWindow * TARGET_RATIO) {
    const tighter = planCompaction(messages, {
      currentTokens,
      contextWindow,
      keepRecentPrompts: 1,
      maxTurns: 1,
      ...overrides,
    });
    if (tighter.shouldCompact && tighter.anchorIndex >= plan.anchorIndex) {
      const rebuilt = build(tighter);
      if (rebuilt) {
        finalPlan = tighter;
        built = rebuilt;
      }
    }
  }

  try {
    const summary = await summarizeForCompaction(agent, messages, sessionId, deps, {
      currentTokens,
    });
    let digestContent: string;
    let digestSource: "llm" | "mechanical";
    if (summary) {
      digestContent = summary.digest;
      digestSource = "llm";
    } else if (currentTokens > contextWindow * HARD_LIMIT_RATIO) {
      digestContent = sanitizeDigestContent(generateDigest(messages.slice(0, finalPlan.anchorIndex + 1)));
      digestSource = "mechanical";
    } else {
      logger.warn({ sessionId }, "llm summary unavailable, skipping compaction this turn");
      return;
    }

    eventLog.append("compaction/applied", {
      anchorSeq: built.anchorSeq,
      digestContent,
      excludedSeqs: built.excludedSeqs,
      digestSource,
    });

    logger.info(
      {
        anchorSeq: built.anchorSeq,
        compactedMessages: finalPlan.anchorIndex + 1,
        tokensBefore: currentTokens,
        tokensAfter: built.postEstimate,
        digestSource,
      },
      "compaction applied",
    );
  } catch (err) {
    logger.error({ err }, "compaction failed, keeping live buffer");
  }
}
