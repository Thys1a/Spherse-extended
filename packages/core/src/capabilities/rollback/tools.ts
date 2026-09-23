import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AccessPolicyProvider } from "../../access/access-policy.js";
import type { DataStore } from "../data/types.js";
import { VersionConflictError } from "../data/types.js";
import type { CardStore } from "../card/types.js";
import {
  TURN_SIDE_EFFECTS_STORE_KEY,
  type SideEffectRef,
  type TurnSideEffectSource,
} from "../../tool-attribution.js";
import type { StoreRegistry } from "../../kernel/ports.js";

const ROLLBACK_TURN_GUIDE =
  "Undo the data/card writes of one finished turn (turn-scoped undo, newest write first). " +
  "Each write is restored only if its file is untouched since the recorded version; " +
  "conflicted or non-rollbackable writes are reported for manual handling, never force-overwritten. " +
  "Only data (*.data.json) and card (*.card.json) writes with undo records can be rolled back; " +
  "file writes, memory, triggers, and SDK writes outside a turn are excluded.";

const RollbackTurnParams = Type.Object({
  turnSeq: Type.Integer({ minimum: 0, description: "turn/start seq of the finished turn to undo" }),
});

export interface RollbackTurnDeps {
  dataStore: DataStore;
  cardStore: CardStore;
  stores: StoreRegistry;
  sessionId: string;
  getPolicy: AccessPolicyProvider;
}

export function createRollbackTurnTool(deps: RollbackTurnDeps): AgentTool<typeof RollbackTurnParams> {
  return {
    name: "rollback_turn",
    label: "Rollback Turn",
    description: ROLLBACK_TURN_GUIDE,
    parameters: RollbackTurnParams,
    async execute(toolCallId, params, _signal) {
      const source = deps.stores.get<TurnSideEffectSource>(TURN_SIDE_EFFECTS_STORE_KEY);
      if (!source) {
        return {
          content: [{ type: "text" as const, text: "Error: turn side-effect index is unavailable." }],
          details: { sessionId: deps.sessionId, turnSeq: params.turnSeq, error: true },
        };
      }
      const refs = source.listSideEffectsByTurn(deps.sessionId, params.turnSeq);
      const undone: string[] = [];
      const skipped: string[] = [];
      const failed: string[] = [];
      for (const ref of [...refs].reverse()) {
        const outcome = await rollbackRef(ref, deps, toolCallId);
        if (outcome === "undone") undone.push(describeRef(ref));
        else if (outcome === "skipped") skipped.push(describeRef(ref));
        else failed.push(describeRef(ref));
      }
      const lines = [`rollback turn ${params.turnSeq}: ${undone.length} undone, ${skipped.length} skipped, ${failed.length} failed.`];
      if (skipped.length > 0) lines.push(`Needs manual handling: ${skipped.join("; ")}`);
      if (failed.length > 0) lines.push(`Failed: ${failed.join("; ")}`);
      if (refs.length === 0) lines.push("No recorded side effects for this turn (unknown turn, no writes, or writes without undo records).");
      return {
        content: [{ type: "text" as const, text: lines.join(" ") }],
        details: { sessionId: deps.sessionId, turnSeq: params.turnSeq, undone, skipped, failed },
      };
    },
  };
}

function describeRef(ref: SideEffectRef): string {
  return `${ref.type}:${ref.file}`;
}

async function rollbackRef(
  ref: SideEffectRef,
  deps: RollbackTurnDeps,
  toolCallId: string,
): Promise<"undone" | "skipped" | "failed"> {
  if (ref.undo === undefined || ref.version === undefined) return "skipped";
  try {
    deps.getPolicy().assertWrite(ref.file);
  } catch {
    return "failed";
  }
  const attribution = { sessionId: deps.sessionId, toolCallId };
  const idempotencyKey = `rollback:${toolCallId}`;
  try {
    if (ref.type === "data") {
      await deps.dataStore.rollbackUndo(ref.file, ref.undo, ref.version, {
        idempotencyKey,
        ...attribution,
      });
      return "undone";
    }
    if (ref.type === "card") {
      await deps.cardStore.rollbackUndo(ref.file, ref.undo, ref.version, {
        idempotencyKey,
        ...attribution,
      });
      return "undone";
    }
    return "skipped";
  } catch (err) {
    if (err instanceof VersionConflictError || /version conflict/.test((err as Error).message)) return "skipped";
    return "failed";
  }
}
