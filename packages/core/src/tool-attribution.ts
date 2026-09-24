export interface TurnAttribution {
  turnSeq: number;
}

export type SideEffectType = "data" | "card" | "write" | "edit" | "memory" | "trigger";

export type UndoOp =
  | "append"
  | "update"
  | "remove"
  | "set"
  | "rawSet"
  | "rawDelete"
  | "cardUpdate"
  | "cardBulk"
  | "cardAdd"
  | "cardRemove";

export interface UndoRecord {
  op: UndoOp;
  path: string;
  before?: unknown;
  after?: unknown;
  index?: number;
}

export interface SideEffectRef {
  type: SideEffectType;
  file: string;
  version?: string;
  undo?: UndoRecord;
}

export interface TurnSideEffectSource {
  listSideEffectsByTurn(sessionId: string, turnSeq: number): SideEffectRef[];
}

export const TURN_SIDE_EFFECTS_STORE_KEY = "turnSideEffects";

export const MAX_UNDO_MIRROR_BYTES = 256 * 1024;

export function overUndoMirrorCap(value: unknown): boolean {
  if (value === undefined) return false;
  try {
    return (JSON.stringify(value)?.length ?? 0) > MAX_UNDO_MIRROR_BYTES;
  } catch {
    return true;
  }
}

const REGISTRY_CAPACITY = 1024;

export class ToolAttributionRegistry {
  private readonly attributions = new Map<string, TurnAttribution>();

  private static key(sessionId: string, toolCallId: string): string {
    return `${sessionId}${toolCallId}`;
  }

  begin(sessionId: string, toolCallId: string, attribution: TurnAttribution): void {
    const key = ToolAttributionRegistry.key(sessionId, toolCallId);
    if (this.attributions.has(key)) this.attributions.delete(key);
    this.attributions.set(key, attribution);
    while (this.attributions.size > REGISTRY_CAPACITY) {
      const oldest = this.attributions.keys().next().value;
      if (oldest === undefined) break;
      this.attributions.delete(oldest);
    }
  }

  attribute(sessionId: string, toolCallId: string): TurnAttribution | undefined {
    return this.attributions.get(ToolAttributionRegistry.key(sessionId, toolCallId));
  }

  drop(sessionId: string, toolCallId: string): void {
    this.attributions.delete(ToolAttributionRegistry.key(sessionId, toolCallId));
  }
}

function detailsRecord(details: unknown): Record<string, unknown> | null {
  return typeof details === "object" && details !== null && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null;
}

function pathOf(details: unknown): string | null {
  const record = detailsRecord(details);
  if (!record || typeof record.path !== "string" || !record.path) return null;
  if (record.error === true || record.denied === true || record.jsonError === true) return null;
  return record.path;
}

const UNDO_OPS: ReadonlySet<string> = new Set([
  "append", "update", "remove", "set", "rawSet", "rawDelete",
  "cardUpdate", "cardBulk", "cardAdd", "cardRemove",
]);

function undoOf(details: unknown): UndoRecord | undefined {
  const record = detailsRecord(details);
  const raw = record?.undo;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const envelope = raw as Record<string, unknown>;
  if (typeof envelope.op !== "string" || !UNDO_OPS.has(envelope.op)) return undefined;
  if (typeof envelope.path !== "string" || !envelope.path) return undefined;
  return {
    op: envelope.op as UndoOp,
    path: envelope.path,
    ...(envelope.before !== undefined ? { before: envelope.before } : {}),
    ...(envelope.after !== undefined ? { after: envelope.after } : {}),
    ...(typeof envelope.index === "number" ? { index: envelope.index } : {}),
  };
}

export function deriveSideEffects(toolName: string, details: unknown): SideEffectRef[] {
  switch (toolName) {
    case "mutate_data": {
      const file = pathOf(details);
      if (!file) return [];
      const record = detailsRecord(details);
      const version = record && typeof record.version === "string" ? record.version : undefined;
      const undo = undoOf(details);
      return [{ type: "data", file, ...(version !== undefined ? { version } : {}), ...(undo !== undefined ? { undo } : {}) }];
    }
    case "edit_card": {
      const file = pathOf(details);
      if (!file) return [];
      const record = detailsRecord(details);
      const version = record && typeof record.version === "string" ? record.version : undefined;
      const undo = undoOf(details);
      return [
        {
          type: "card",
          file,
          ...(version !== undefined ? { version } : {}),
          ...(undo !== undefined ? { undo } : {}),
        },
      ];
    }
    case "write_file": {
      const file = pathOf(details);
      return file ? [{ type: "write", file }] : [];
    }
    case "edit_file": {
      const file = pathOf(details);
      return file ? [{ type: "edit", file }] : [];
    }
    case "memory_save": {
      const record = detailsRecord(details);
      if (!record || record.error === true) return [];
      if (typeof record.id !== "string" && typeof record.id !== "number") return [];
      return [{ type: "memory", file: String(record.id) }];
    }
    case "emit_trigger_event": {
      const record = detailsRecord(details);
      if (!record || record.error === true || typeof record.eventName !== "string") return [];
      return [{ type: "trigger", file: record.eventName }];
    }
    case "manage_trigger": {
      const record = detailsRecord(details);
      if (!record || record.error === true || typeof record.triggerId !== "string") return [];
      if (
        record.action !== "create" &&
        record.action !== "update" &&
        record.action !== "delete" &&
        record.action !== "reset_binding"
      ) {
        return [];
      }
      return [{ type: "trigger", file: record.triggerId }];
    }
    case "append_changelog": {
      return [{ type: "write", file: "CHANGELOG.md" }];
    }
    case "copy_file":
    case "move_file": {
      const record = detailsRecord(details);
      if (!record || typeof record.destination !== "string") return [];
      if (
        record.denied === true ||
        record.destinationExists === true ||
        record.exists === false ||
        record.isDirectory === true
      ) {
        return [];
      }
      return [{ type: "write", file: record.destination }];
    }
    case "generate_image": {
      const record = detailsRecord(details);
      if (!record || record.status !== "done" || typeof record.path !== "string") return [];
      return [{ type: "write", file: record.path }];
    }
    default:
      return [];
  }
}
