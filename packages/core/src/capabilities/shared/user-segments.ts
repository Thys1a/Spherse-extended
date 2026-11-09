import type { AgentMessage } from "@earendil-works/pi-agent-core";

export function userSegmentIndex(messages: readonly AgentMessage[], depth: number): number {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      seen += 1;
      if (seen === depth) return i;
    }
  }
  return 0;
}
