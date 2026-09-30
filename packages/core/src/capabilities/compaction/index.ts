import type { Capability } from "../../kernel/capability.js";
import type { PreTurnCompaction, TurnHooksFactory } from "../../kernel/turn-hooks.js";
import { maybeCompactLog, type MaybeCompactDeps, type ObservedWindowStore } from "./transform.js";

export type { PreTurnCompaction };

export interface CompactionCapability extends Capability {
  preTurnCompaction: PreTurnCompaction;
}

export function compactionCapability(deps: MaybeCompactDeps): CompactionCapability {
  const windows = new Map<string, number | undefined>();
  const storeFor = (sessionId: string): ObservedWindowStore => ({
    get: () => windows.get(sessionId),
    set: (window: number) => {
      windows.set(sessionId, window);
    },
  });

  const turnHooks: TurnHooksFactory = (_agentId, sessionId) => {
    return {
      async afterTurn(agent, eventLog) {
        await maybeCompactLog(eventLog, agent, sessionId, deps, storeFor(sessionId));
      },
    };
  };

  return {
    id: "compaction",
    turnHooks,
    preTurnCompaction: (eventLog, agent, sessionId) =>
      maybeCompactLog(eventLog, agent, sessionId, deps, storeFor(sessionId)),
  };
}
