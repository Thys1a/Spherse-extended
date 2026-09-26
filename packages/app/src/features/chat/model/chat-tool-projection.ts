import type {
  AssistantMessage,
  ImageCardDetails,
  Message,
  RenderCardDetails,
  ToolCall as AgentToolCall,
} from "@spherse/core";
import {
  isCommandCardDetails,
  isImageCardDetails,
  isImageCardResultDetails,
  isRejectedToolDetails,
  isRenderCardDetails,
  isRenderCardResultDetails,
  isTextContent,
  isThinkingContent,
  isToolCall,
} from "./agent-event-parse";
import type { ChatCard, CommandCard, ToolCallInfo } from "../types";
import type { AssistantEntry, EntryDiagnostics } from "./entry";

export function extractMessageText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(isTextContent).map((item) => item.text).join("");
}

export function extractMessageThinking(content: Message["content"]): string {
  if (typeof content === "string" || !Array.isArray(content)) return "";
  const out: string[] = [];
  for (const item of content) {
    if (!isThinkingContent(item)) continue;
    if (typeof item.text === "string" && item.text !== "") out.push(item.text);
    else if (typeof item.thinking === "string") out.push(item.thinking);
    else if (typeof item.content === "string") out.push(item.content);
  }
  return out.join("");
}

export function extractMessageDiagnostics(message: {
  provider?: unknown;
  model?: unknown;
  stopReason?: unknown;
  rawStopReason?: unknown;
  errorMessage?: unknown;
  usage?: { input?: unknown; output?: unknown; cacheRead?: unknown; reasoning?: unknown } | null;
  promptEstimate?: unknown;
}): EntryDiagnostics {
  const usage = message.usage;
  const diagnostics: EntryDiagnostics = {
    ...(typeof message.provider === "string" ? { provider: message.provider } : {}),
    ...(typeof message.model === "string" ? { model: message.model } : {}),
    ...(typeof message.stopReason === "string" ? { stopReason: message.stopReason } : {}),
    ...(typeof message.rawStopReason === "string" ? { rawStopReason: message.rawStopReason } : {}),
    ...(typeof message.errorMessage === "string" ? { errorMessage: message.errorMessage } : {}),
    ...(typeof message.promptEstimate === "number" ? { promptEstimate: message.promptEstimate } : {}),
  };
  if (usage !== undefined && usage !== null && typeof usage === "object") {
    const { input, output, cacheRead, reasoning } = usage as Record<string, unknown>;
    if (typeof input === "number" && typeof cacheRead === "number") {
      diagnostics.promptTokens = input + cacheRead;
    } else if (typeof input === "number") {
      diagnostics.promptTokens = input;
    }
    if (typeof output === "number") diagnostics.outputTokens = output;
    if (typeof reasoning === "number") diagnostics.reasoningTokens = reasoning;
  }
  return diagnostics;
}

export interface AssistantExtrasSource {
  content: Message["content"];
  stopReason?: unknown;
  rawStopReason?: unknown;
  errorMessage?: unknown;
  provider?: unknown;
  model?: unknown;
  usage?: {
    input?: unknown;
    output?: unknown;
    cacheRead?: unknown;
    reasoning?: unknown;
  } | null;
  promptEstimate?: unknown;
}

export function extractAssistantExtras(
  message: AssistantExtrasSource,
  seq?: number,
): Pick<AssistantEntry, "_thinking" | "_thinkingTruncated" | "_diagnostics"> {
  const extras: Pick<AssistantEntry, "_thinking" | "_thinkingTruncated" | "_diagnostics"> = {};
  const thinking = extractMessageThinking(message.content);
  if (thinking !== "") extras._thinking = thinking;
  const truncated = message.stopReason === "length";
  if (truncated) extras._thinkingTruncated = true;
  if (message.stopReason === "error" || truncated) {
    extras._diagnostics = {
      ...extractMessageDiagnostics(message),
      ...(seq !== undefined ? { seq } : {}),
    };
  }
  return extras;
}

export function extractToolCalls(
  message: AssistantMessage,
): ToolCallInfo[] | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const toolCalls = message.content.filter(isToolCall);
  return toolCalls.length > 0
    ? toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments ?? {},
        status: "running",
      }))
    : undefined;
}

export function extractCardFromPartial(
  toolName: string,
  partialResult: unknown,
): ChatCard | undefined {
  if (!isObject(partialResult)) return undefined;
  const details = partialResult.details;
  if (toolName === "render_card" && isRenderCardDetails(details)) {
    return details;
  }
  if (toolName === "generate_image" && isImageCardDetails(details)) {
    return details;
  }
  if (toolName === "run_command" && isCommandCardDetails(details)) {
    return commandCardFromDetails(details);
  }
  return undefined;
}

export function buildCardFromToolResult(
  toolName: string,
  toolCall: AgentToolCall,
  details: unknown,
): ChatCard | undefined {
  if (toolName === "render_card" && isRenderCardResultDetails(details)) {
    const card: RenderCardDetails = {
      type: "html",
      html:
        details.html ??
        (details.file_path
          ? undefined
          : getStringArg(toolCall.arguments, "content")),
      file_path: details.file_path,
      title: details.title,
      width: details.width,
      height: details.height ?? 400,
      max_width: details.max_width ?? 800,
      max_height: details.max_height ?? 600,
    };
    return card;
  }
  if (toolName === "generate_image" && isImageCardResultDetails(details)) {
    const card: ImageCardDetails = {
      type: "image",
      status: details.status ?? "done",
      path: details.path,
      prompt: details.prompt ?? "",
      model: details.model,
      mimeType: details.mimeType,
      errorMessage: details.errorMessage,
    };
    return card;
  }
  if (toolName === "run_command") {
    if (isRejectedToolDetails(details)) {
      return {
        type: "command",
        status: "error",
        rejected: true,
        command: getStringArg(toolCall.arguments, "command") ?? "",
        stdout: "",
        stderr: "",
      };
    }
    if (isCommandCardDetails(details)) {
      return {
        ...commandCardFromDetails(details),
        status: details.status === "error" ? "error" : "completed",
      };
    }
  }
  if (toolName === "ask_user" && isObject(details) && details.cardType === "question") {
    const question = typeof details.question === "string" ? details.question : "";
    const rawOptions = Array.isArray(details.options)
      ? details.options.filter((o): o is string => typeof o === "string")
      : [];
    const options = rawOptions.length > 0 ? rawOptions : undefined;
    if (typeof details.answer === "string") {
      return {
        type: "question",
        status: "answered",
        question,
        options,
        answer: details.answer,
      };
    }
    if (details.timedOut === true) {
      return {
        type: "question",
        status: "timeout",
        question,
        options,
      };
    }
  }
  return undefined;
}

function commandCardFromDetails(
  details: Record<string, unknown>,
): CommandCard {
  const status = details.status === "error" ? "error" : "running";
  return {
    type: "command",
    status,
    command: typeof details.command === "string" ? details.command : "",
    cwd: typeof details.cwd === "string" ? details.cwd : undefined,
    stdout: typeof details.stdout === "string" ? details.stdout : "",
    stderr: typeof details.stderr === "string" ? details.stderr : "",
    exitCode:
      typeof details.exitCode === "number" ? details.exitCode : undefined,
    durationMs:
      typeof details.durationMs === "number" ? details.durationMs : undefined,
    timedOut: details.timedOut === true ? true : undefined,
    aborted: details.aborted === true ? true : undefined,
  };
}

function getStringArg(args: unknown, key: string): string | undefined {
  if (!isObject(args)) return undefined;
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
