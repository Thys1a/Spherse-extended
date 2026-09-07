import { extractSpeechText } from "./speech-text";

export type TurnCompleteHandler = (sessionId: string, text: string) => void;

const handlers = new Set<TurnCompleteHandler>();

export function onAssistantTurnComplete(handler: TurnCompleteHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitAssistantTurnComplete(sessionId: string, text: string): void {
  for (const handler of handlers) handler(sessionId, text);
}

interface TurnMessage {
  role?: string;
  content?: unknown;
  stopReason?: string;
}

export function extractLastAssistantText(messages: TurnMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (message.stopReason === "error") return null;
    const text = messageToText(message.content);
    if (text) return text;
  }
  return null;
}

function messageToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type?: string; text?: string } =>
          typeof part === "object" && part !== null,
      )
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("");
  }
  return "";
}

export function turnSpeechText(messages: TurnMessage[]): string {
  const text = extractLastAssistantText(messages);
  return text ? extractSpeechText(text) : "";
}
