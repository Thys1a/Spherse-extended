import type { ChatMessage, SendableFile } from "../types";

export type RetryPlan =
  | { kind: "none" }
  | { kind: "retry-last" }
  | { kind: "resend"; content: string; attachments?: SendableFile[]; dropCount: number };

export function planRetry(messages: ChatMessage[]): RetryPlan {
  const last = messages[messages.length - 1];

  if (last?.role === "assistant" && last._error) {
    if (last._withdrawError) {
      return { kind: "none" };
    }
    if (last._turnError) {
      return { kind: "retry-last" };
    }
    const userMsg = findLastUser(messages);
    if (userMsg) {
      return {
        kind: "resend",
        content: userMsg.content,
        attachments: toSendable(userMsg),
        dropCount: messages.length - messages.lastIndexOf(userMsg),
      };
    }
    return { kind: "none" };
  }

  if (last?.role === "user" && last._sendFailed) {
    return {
      kind: "resend",
      content: last.content,
      attachments: toSendable(last),
      dropCount: 1,
    };
  }

  return { kind: "none" };
}

function findLastUser(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

function toSendable(msg: ChatMessage): SendableFile[] | undefined {
  if (!msg._attachments || msg._attachments.length === 0) return undefined;
  return msg._attachments.map((a) => ({
    path: a.path,
    mimeType: a.mimeType,
    ...(a.name !== undefined ? { name: a.name } : {}),
    ...(a.bytes !== undefined ? { size: a.bytes } : {}),
    ...(a.width !== undefined ? { width: a.width } : {}),
    ...(a.height !== undefined ? { height: a.height } : {}),
  }));
}
