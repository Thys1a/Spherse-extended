import type { Message } from "@earendil-works/pi-ai";
import type { AgentProfile } from "../types.js";
import { estimateTokens } from "../context/token-estimate.js";
import { extractLastUsageTotalTokens } from "../context/token-estimate.js";
export { extractLastUsageTotalTokens } from "../context/token-estimate.js";

export interface SessionStatus {
  currentTokens: number;
  contextWindowLimit: number | null;
}

export function resolveModelWithFallback<T>(
  profile: AgentProfile,
  resolveModelById: (modelId: string) => T,
  defaultModel?: string,
  sessionModel?: string,
): T | undefined {
  const candidates = sessionModel
    ? [sessionModel, profile.model, defaultModel]
    : profile.model
      ? [profile.model, defaultModel]
      : [defaultModel];
  for (const modelId of candidates) {
    if (!modelId) continue;
    try {
      return resolveModelById(modelId);
    } catch {
      continue;
    }
  }
  return undefined;
}

export function resolveContextWindow(
  profile: AgentProfile,
  resolveModelById: (modelId: string) => unknown,
  defaultModel?: string,
  sessionModel?: string,
): number | null {
  const model = resolveModelWithFallback(profile, resolveModelById, defaultModel, sessionModel) as
    | { contextWindow?: number }
    | undefined;
  return model?.contextWindow ?? null;
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
