export interface TurnAttribution {
  sessionId: string;
  turnSeq: number;
}

export type SideEffectType = "data" | "card" | "write" | "edit" | "memory" | "trigger";

export interface SideEffectRef {
  type: SideEffectType;
  file: string;
  version?: string;
}

const REGISTRY_CAPACITY = 1024;

export class ToolAttributionRegistry {
  private readonly attributions = new Map<string, TurnAttribution>();

  begin(toolCallId: string, attribution: TurnAttribution): void {
    if (this.attributions.has(toolCallId)) this.attributions.delete(toolCallId);
    this.attributions.set(toolCallId, attribution);
    while (this.attributions.size > REGISTRY_CAPACITY) {
      const oldest = this.attributions.keys().next().value;
      if (oldest === undefined) break;
      this.attributions.delete(oldest);
    }
  }

  attribute(toolCallId: string): TurnAttribution | undefined {
    return this.attributions.get(toolCallId);
  }

  drop(toolCallId: string): void {
    this.attributions.delete(toolCallId);
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

export function deriveSideEffects(toolName: string, details: unknown): SideEffectRef[] {
  switch (toolName) {
    case "mutate_data": {
      const file = pathOf(details);
      if (!file) return [];
      const record = detailsRecord(details);
      const version = record && typeof record.version === "string" ? record.version : undefined;
      return [{ type: "data", file, ...(version !== undefined ? { version } : {}) }];
    }
    case "edit_card": {
      const file = pathOf(details);
      return file ? [{ type: "card", file }] : [];
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
      if (record.action !== "create" && record.action !== "update" && record.action !== "delete") {
        return [];
      }
      return [{ type: "trigger", file: record.triggerId }];
    }
    default:
      return [];
  }
}
