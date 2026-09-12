import type { Message } from "@earendil-works/pi-ai";
import type { AgentProfile } from "../types.js";
import { estimateTokens } from "../context/token-estimate.js";
import { extractLastUsageTotalTokens } from "../context/token-estimate.js";
export { extractLastUsageTotalTokens } from "../context/token-estimate.js";

export interface SessionStatus {
  currentTokens: number;
  contextWindowLimit: number | null;
}

export function resolveEffectiveModelId(
  profile: AgentProfile,
  defaultModel?: string,
  sessionModel?: string,
): string | undefined {
  return sessionModel || profile.model || defaultModel || undefined;
}

export function resolveContextWindow(
  profile: AgentProfile,
  resolveModelById: (modelId: string) => unknown,
  defaultModel?: string,
  sessionModel?: string,
): number | null {
  const modelId = resolveEffectiveModelId(profile, defaultModel, sessionModel);
  if (!modelId) return null;
  try {
    return (resolveModelById(modelId) as { contextWindow?: number })?.contextWindow ?? null;
  } catch {
    return null;
  }
}

export function computeSessionStatus(
  messages: unknown[],
  profile: AgentProfile,
  resolveModelById: (modelId: string) => unknown,
  defaultModel?: string,
  sessionModel?: string,
): SessionStatus {
  const lastUsage = extractLastUsageTotalTokens(messages);
  const currentTokens = lastUsage ?? estimateTokens(messages as Message[]);
  return {
    currentTokens,
    contextWindowLimit: resolveContextWindow(profile, resolveModelById, defaultModel, sessionModel),
  };
}
