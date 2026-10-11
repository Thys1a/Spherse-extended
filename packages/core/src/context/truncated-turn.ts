export interface TruncationCheckMessage {
  role?: string;
  stopReason?: string;
  rawStopReason?: string;
  content?: unknown;
  usage?: { totalTokens?: unknown };
  promptEstimate?: unknown;
}

export function isTruncatedTurn(message: unknown): boolean {
  const m = message as TruncationCheckMessage | null | undefined;
  if (!m || m.role !== "assistant") return false;
  if (m.stopReason !== "length" && m.rawStopReason !== "length") return false;
  if (!Array.isArray(m.content)) return true;
  return !m.content.some((block) => {
    const type = (block as { type?: unknown }).type;
    return type === "text" || type === "toolCall";
  });
}

export function markTruncated<T>(message: T): T {
  if (!isTruncatedTurn(message)) return message;
  const m = message as Record<string, unknown>;
  return {
    ...m,
    stopReason: "error",
    rawStopReason: (m.rawStopReason as string | undefined) ?? "length",
    errorMessage:
      "输出被上游截断：本轮没有产生正文或工具调用（疑似上下文超出模型可用窗口）",
  } as T;
}

export function readPromptEstimate(message: unknown): number | undefined {
  const v = (message as TruncationCheckMessage | null | undefined)?.promptEstimate;
  return typeof v === "number" ? v : undefined;
}

export function readUsageTotal(message: unknown): number | undefined {
  const v = (message as TruncationCheckMessage | null | undefined)?.usage?.totalTokens;
  return typeof v === "number" ? v : undefined;
}
