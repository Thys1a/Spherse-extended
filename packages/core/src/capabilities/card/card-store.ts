import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileWriteMutex } from "../../utils/file-write-mutex.js";
import type { Logger } from "../../logger.js";
import { shouldSkipDirEntry } from "../../utils/fs-walk.js";
import { resolveProjectPath } from "../../utils/path-safety.js";
import { resolveCardFile, toPosixRelative } from "./path-guard.js";
import { toParsedCard, type ParsedCard } from "./parser.js";
import { CardCache } from "./cache.js";
import { searchEntries } from "./search.js";
import {
  CardFileCorruptedError,
  CardNotFoundError,
  CardTooLargeError,
  CardWriteFailedError,
  EntryNotFoundError,
  InvalidFieldError,
  type CardChangeEvent,
  type CardEntry,
  type CardEntrySummary,
  type CardListItem,
  type CardMeta,
  type CardSearchHit,
  type CardSearchOpts,
  type CardStore,
  type CardWriteOptions,
  type EntryPatch,
} from "./types.js";
import { overUndoMirrorCap, type ToolAttributionRegistry, type UndoRecord } from "../../tool-attribution.js";

export const MAX_CARD_FILE_SIZE = 20 * 1024 * 1024;

const WRITABLE_FIELDS: ReadonlySet<string> = new Set([
  "keys",
  "secondary_keys",
  "comment",
  "content",
  "constant",
  "selective",
  "insertion_order",
  "enabled",
  "position",
  "use_regex",
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validatePatch(patch: EntryPatch): string[] {
  const invalid: string[] = [];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return ["patch"];
  for (const [key, value] of Object.entries(patch)) {
    if (!WRITABLE_FIELDS.has(key)) {
      invalid.push(key);
      continue;
    }
    switch (key) {
      case "keys":
      case "secondary_keys":
        if (!isStringArray(value)) invalid.push(key);
        break;
      case "comment":
      case "content":
        if (typeof value !== "string") invalid.push(key);
        break;
      case "constant":
      case "selective":
      case "enabled":
      case "use_regex":
        if (typeof value !== "boolean") invalid.push(key);
        break;
      case "insertion_order":
        if (typeof value !== "number") invalid.push(key);
        break;
      case "position":
        if (value !== "before_char" && value !== "after_char") invalid.push(key);
        break;
      default:
        invalid.push(key);
    }
  }
  return invalid;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canonicalEntry(id: number, body: EntryPatch): Record<string, unknown> {
  return {
    id,
    keys: body.keys ?? [],
    secondary_keys: body.secondary_keys ?? [],
    comment: body.comment ?? "",
    content: body.content ?? "",
    constant: body.constant ?? false,
    selective: body.selective ?? false,
    insertion_order: body.insertion_order ?? 0,
    enabled: body.enabled ?? true,
    position: body.position ?? "after_char",
    use_regex: body.use_regex ?? false,
    extensions: {},
  };
}

function parseUndoEntryIds(path: string): { kind: "entry" | "entries"; ids: number[] } | null {
  const single = /^entry:(\d+)$/.exec(path);
  if (single) return { kind: "entry", ids: [Number(single[1])] };
  const multi = /^entries:(\d+(,\d+)*)$/.exec(path);
  if (multi) return { kind: "entries", ids: multi[1].split(",").map(Number) };
  return null;
}

function cloneUndoEntry(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`rollback record incomplete: ${path}`);
  }
  return structuredClone(value) as Record<string, unknown>;
}

function applyCardInverse(
  list: Array<Record<string, unknown>>,
  rel: string,
  undo: UndoRecord,
): UndoRecord {
  switch (undo.op) {
    case "cardUpdate": {
      const parsed = parseUndoEntryIds(undo.path);
      const id = parsed?.kind === "entry" ? parsed.ids[0] : undefined;
      if (id === undefined) throw new Error(`unsupported rollback path: ${undo.path}`);
      const idx = list.findIndex((e) => e.id === id);
      if (idx < 0) throw new EntryNotFoundError(rel, id);
      const current = structuredClone(list[idx]);
      list[idx] = cloneUndoEntry(undo.before, undo.path);
      return { op: "cardUpdate", path: undo.path, before: current };
    }
    case "cardBulk": {
      const parsed = parseUndoEntryIds(undo.path);
      if (parsed?.kind !== "entries" || !Array.isArray(undo.before)) {
        throw new Error(`unsupported rollback path: ${undo.path}`);
      }
      const dual: Array<{ id: number; entry: Record<string, unknown> }> = [];
      for (const item of undo.before as Array<{ id: number; entry: unknown }>) {
        const idx = list.findIndex((e) => e.id === item.id);
        if (idx < 0) throw new EntryNotFoundError(rel, item.id);
        dual.push({ id: item.id, entry: structuredClone(list[idx]) });
        list[idx] = cloneUndoEntry(item.entry, undo.path);
      }
      return { op: "cardBulk", path: undo.path, before: dual };
    }
    case "cardAdd": {
      const parsed = parseUndoEntryIds(undo.path);
      const id = parsed?.kind === "entry" ? parsed.ids[0] : undefined;
      if (id === undefined) throw new Error(`unsupported rollback path: ${undo.path}`);
      const idx = list.findIndex((e) => e.id === id);
      if (idx < 0) throw new EntryNotFoundError(rel, id);
      const [removed] = list.splice(idx, 1);
      return { op: "cardRemove", path: `entry:${id}`, before: structuredClone(removed), index: idx };
    }
    case "cardRemove": {
      const parsed = parseUndoEntryIds(undo.path);
      if (parsed?.kind !== "entry") throw new Error(`unsupported rollback path: ${undo.path}`);
      const id = parsed.ids[0];
      if (list.some((e) => e.id === id)) throw new Error(`rollback entry exists: ${undo.path}`);
      const entry = cloneUndoEntry(undo.before, undo.path);
      const at = undo.index !== undefined ? Math.min(Math.max(undo.index, 0), list.length) : list.length;
      list.splice(at, 0, entry);
      return { op: "cardAdd", path: `entry:${id}`, after: id };
    }
    default:
      throw new Error(`unsupported rollback op: ${String((undo as { op?: unknown }).op)}`);
  }
}

function rawEntryList(doc: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = doc.data as Record<string, unknown>;
  const book = data.character_book as Record<string, unknown>;
  return book.entries as Array<Record<string, unknown>>;
}

export interface CreateCardStoreOptions {
  projectRoot: string;
  fileWriteMutex: FileWriteMutex;
  logger: Logger;
  canRead?: (relativePath: string) => boolean;
  attribution?: ToolAttributionRegistry;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function toSummary(entry: CardEntry): CardEntrySummary {
  return {
    id: entry.id,
    comment: entry.comment,
    keys: entry.keys,
    constant: entry.constant,
    enabled: entry.enabled,
    position: entry.position,
    insertion_order: entry.insertion_order,
    words: entry.words,
  };
}

export function createCardStore(opts: CreateCardStoreOptions): CardStore {
  const root = path.resolve(opts.projectRoot);
  const mutex = opts.fileWriteMutex;
  const logger = opts.logger;
  const canRead = opts.canRead;
  const attribution = opts.attribution;
  const cache = new CardCache();
  const changeHandlers = new Set<(e: CardChangeEvent) => void>();
  const rollbackIdem = new Map<string, { version: string; dual: UndoRecord }>();

  function emitChange(
    file: string,
    summary: string,
    version: string,
    undo: UndoRecord | undefined,
    toolCallId: string | undefined,
    sessionId: string | undefined,
  ): void {
    const resolved =
      toolCallId !== undefined && sessionId !== undefined
        ? attribution?.attribute(sessionId, toolCallId)
        : undefined;
    const event: CardChangeEvent = {
      file,
      version,
      origin: toolCallId !== undefined ? "agent" : "sdk",
      ...(resolved !== undefined && sessionId !== undefined
        ? { sessionId, turnSeq: resolved.turnSeq }
        : {}),
      ...(toolCallId !== undefined ? { toolCallId } : {}),
      summary,
      ...(undo !== undefined ? { op: undo.op, path: undo.path, ...(undo.before !== undefined ? { before: undo.before } : {}) } : {}),
    };
    for (const handler of changeHandlers) {
      try {
        handler(event);
      } catch (err) {
        logger.warn({ err, file }, "card change handler failed");
      }
    }
  }

  async function load(absPath: string): Promise<ParsedCard> {
    const rel = toPosixRelative(root, absPath);
    let buf: Buffer;
    try {
      buf = await fs.readFile(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CardNotFoundError(rel);
      }
      throw err;
    }
    if (buf.length > MAX_CARD_FILE_SIZE) throw new CardTooLargeError(rel);
    const hash = sha256(buf);
    const cached = cache.get(absPath, hash);
    if (cached) return cached;
    const card = toParsedCard(buf);
    if (!card) throw new CardFileCorruptedError(rel);
    cache.set(absPath, hash, card);
    return card;
  }

  async function loadByRel(file: string): Promise<{ absPath: string; card: ParsedCard }> {
    const absPath = resolveCardFile(root, file);
    return { absPath, card: await load(absPath) };
  }

  async function walkCardFiles(dirAbs: string, out: string[]): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const dirent of dirents) {
      if (shouldSkipDirEntry(dirent.name)) continue;
      const abs = path.join(dirAbs, dirent.name);
      if (dirent.isDirectory()) {
        await walkCardFiles(abs, out);
      } else if (dirent.isFile() && dirent.name.endsWith(".card.json")) {
        const rel = toPosixRelative(root, abs);
        if (rel.split("/").some((segment) => segment.toLowerCase() === ".spherse")) continue;
        if (canRead && !canRead(rel)) continue;
        out.push(abs);
      }
    }
  }

  return {
    async list(dir?: string): Promise<CardListItem[]> {
      const dirRel = (dir ?? "").replace(/\\/g, "/");
      const dirAbs = dirRel ? resolveProjectPath(root, dirRel) : root;
      const found: string[] = [];
      await walkCardFiles(dirAbs, found);
      const items: CardListItem[] = [];
      for (const abs of found) {
        const rel = toPosixRelative(root, abs);
        try {
          const card = await load(abs);
          items.push({
            path: rel,
            name: card.name,
            entryCount: card.entryCount,
            bytes: card.bytes,
          });
        } catch {
          continue;
        }
      }
      items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return items;
    },

    async meta(file: string): Promise<CardMeta> {
      const { card } = await loadByRel(file);
      return {
        spec: card.spec,
        name: card.name,
        entryCount: card.entryCount,
        enabledCount: card.entries.filter((e) => e.enabled).length,
        regexCount: card.regexCount,
      };
    },

    async entries(
      file: string,
      filter?: { enabled?: boolean; constant?: boolean },
    ): Promise<CardEntrySummary[]> {
      const { card } = await loadByRel(file);
      return card.entries
        .filter(
          (e) =>
            (filter?.enabled === undefined || e.enabled === filter.enabled) &&
            (filter?.constant === undefined || e.constant === filter.constant),
        )
        .map(toSummary);
    },

    async search(file: string, searchOpts: CardSearchOpts): Promise<CardSearchHit[]> {
      const { card } = await loadByRel(file);
      return searchEntries(card.entries, searchOpts);
    },

    async entry(file: string, id: number): Promise<CardEntry> {
      const { card } = await loadByRel(file);
      const found = card.entries.find((e) => e.id === id);
      if (!found) throw new EntryNotFoundError(toPosixRelative(root, resolveCardFile(root, file)), id);
      return found;
    },

    async entryMany(file: string, ids: number[]): Promise<CardEntry[]> {
      const { card } = await loadByRel(file);
      const byId = new Map(card.entries.map((e) => [e.id, e]));
      const rel = toPosixRelative(root, resolveCardFile(root, file));
      return ids.map((id) => {
        const found = byId.get(id);
        if (!found) throw new EntryNotFoundError(rel, id);
        return found;
      });
    },

    async updateEntry(
      file: string,
      id: number,
      patch: EntryPatch,
      opts?: CardWriteOptions,
    ): Promise<{ id: number; changed: string[]; version: string; undo?: UndoRecord }> {
      const invalid = validatePatch(patch);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      const result = await mutex.run(absPath, async () => {
        const changed: string[] = [];
        let previous: Record<string, unknown> | undefined;
        const version = await withLockedDoc(absPath, rel, (list) => {
          const raw = list.find((e) => e.id === id);
          if (!raw) throw new EntryNotFoundError(rel, id);
          previous = structuredClone(raw);
          for (const [key, value] of Object.entries(patch)) {
            if (!sameValue(raw[key], value)) {
              raw[key] = value;
              if (!changed.includes(key)) changed.push(key);
            }
          }
        });
        return { id, changed, previous, version };
      });
      if (result.changed.length === 0) return { id: result.id, changed: result.changed, version: result.version };
      const undo: UndoRecord | undefined =
        result.previous === undefined || overUndoMirrorCap(result.previous)
          ? undefined
          : { op: "cardUpdate", path: `entry:${id}`, before: result.previous };
      emitChange(rel, `updateEntry#${id}`, result.version, undo, opts?.toolCallId, opts?.sessionId);
      return undo === undefined
        ? { id: result.id, changed: result.changed, version: result.version }
        : { id: result.id, changed: result.changed, version: result.version, undo };
    },

    async bulkUpdate(
      file: string,
      ids: number[],
      patch: EntryPatch,
      opts?: CardWriteOptions,
    ): Promise<{ count: number; version: string; undo?: UndoRecord }> {
      const invalid = validatePatch(patch);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      if (ids.length === 0) {
        const version = await mutex.run(absPath, async () => withLockedDoc(absPath, rel, () => {}));
        return { count: 0, version };
      }
      const result = await mutex.run(absPath, async () => {
        const previous: Array<{ id: number; entry: Record<string, unknown> }> = [];
        const version = await withLockedDoc(absPath, rel, (list) => {
          for (const id of ids) {
            const raw = list.find((e) => e.id === id);
            if (!raw) throw new EntryNotFoundError(rel, id);
            previous.push({ id, entry: structuredClone(raw) });
            for (const [key, value] of Object.entries(patch)) {
              raw[key] = value;
            }
          }
        });
        return { count: ids.length, previous, version };
      });
      const undo: UndoRecord | undefined = overUndoMirrorCap(result.previous)
        ? undefined
        : { op: "cardBulk", path: `entries:${ids.join(",")}`, before: result.previous };
      emitChange(rel, `bulkUpdate#${ids.length}`, result.version, undo, opts?.toolCallId, opts?.sessionId);
      return undo === undefined
        ? { count: result.count, version: result.version }
        : { count: result.count, version: result.version, undo };
    },

    async addEntry(
      file: string,
      entry: EntryPatch,
      opts?: CardWriteOptions,
    ): Promise<{ id: number; version: string; undo?: UndoRecord }> {
      const invalid = validatePatch(entry);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      const result = await mutex.run(absPath, async () => {
        let newId = 0;
        const version = await withLockedDoc(absPath, rel, (list) => {
          newId = list.reduce((m, e) => Math.max(m, typeof e.id === "number" ? e.id : -1), -1) + 1;
          list.push(canonicalEntry(newId, entry));
        });
        return { id: newId, version };
      });
      const undo: UndoRecord = { op: "cardAdd", path: `entry:${result.id}`, after: result.id };
      emitChange(rel, `addEntry#${result.id}`, result.version, undo, opts?.toolCallId, opts?.sessionId);
      return { id: result.id, version: result.version, undo };
    },

    async removeEntry(
      file: string,
      id: number,
      opts?: CardWriteOptions,
    ): Promise<{ ok: boolean; version: string; undo?: UndoRecord }> {
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      const result = await mutex.run(absPath, async () => {
        let removed: Record<string, unknown> | undefined;
        let index = -1;
        const version = await withLockedDoc(absPath, rel, (list) => {
          const idx = list.findIndex((e) => e.id === id);
          if (idx < 0) throw new EntryNotFoundError(rel, id);
          index = idx;
          const [entry] = list.splice(idx, 1);
          removed = structuredClone(entry);
        });
        return { ok: true as const, removed, index, version };
      });
      if (result.removed === undefined) return { ok: true as const, version: result.version };
      const undo: UndoRecord | undefined = overUndoMirrorCap(result.removed)
        ? undefined
        : { op: "cardRemove", path: `entry:${id}`, before: result.removed, index: result.index };
      emitChange(rel, `removeEntry#${id}`, result.version, undo, opts?.toolCallId, opts?.sessionId);
      return undo === undefined
        ? { ok: true as const, version: result.version }
        : { ok: true as const, version: result.version, undo };
    },

    async rollbackUndo(
      file: string,
      undo: UndoRecord,
      expectedVersion: string,
      opts?: CardWriteOptions,
    ): Promise<{ version: string; undo?: UndoRecord }> {
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      const idemKey = opts?.idempotencyKey !== undefined ? `${absPath}\0${opts.idempotencyKey}` : undefined;
      if (idemKey !== undefined) {
        const cached = rollbackIdem.get(idemKey);
        if (cached !== undefined) return cached;
      }
      const result = await mutex.run(absPath, async () => {
        if (idemKey !== undefined) {
          const inFlight = rollbackIdem.get(idemKey);
          if (inFlight !== undefined) return inFlight;
        }
        const buf = await fs.readFile(absPath).catch((err: unknown) => {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new CardNotFoundError(rel);
          throw err;
        });
        if (sha256(buf) !== expectedVersion) {
          throw new Error(`card version conflict for ${rel}: file changed since the recorded write`);
        }
        let dual: UndoRecord | undefined;
        const version = await withLockedDoc(absPath, rel, (list) => {
          dual = applyCardInverse(list, rel, undo);
        });
        if (!dual) throw new Error(`rollback produced no changes for ${rel}`);
        return { version, dual };
      });
      emitChange(rel, `rollback:${result.dual.op}`, result.version, result.dual, opts?.toolCallId, opts?.sessionId);
      const full = { version: result.version, undo: result.dual };
      if (idemKey !== undefined) {
        rollbackIdem.set(idemKey, { version: result.version, dual: result.dual });
        while (rollbackIdem.size > 1024) {
          const oldest = rollbackIdem.keys().next().value;
          if (oldest === undefined) break;
          rollbackIdem.delete(oldest);
        }
      }
      return full;
    },

    onChange(handler: (e: CardChangeEvent) => void): () => void {
      changeHandlers.add(handler);
      return () => changeHandlers.delete(handler);
    },
  };

  function tmpPathFor(absPath: string): string {
    return path.join(path.dirname(absPath), `.${path.basename(absPath)}.spcard.tmp`);
  }

  async function withLockedDoc(
    absPath: string,
    rel: string,
    mutate: (list: Array<Record<string, unknown>>) => void,
  ): Promise<string> {
    let original: Buffer;
    try {
      original = await fs.readFile(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new CardNotFoundError(rel);
      throw err;
    }
    const card = toParsedCard(original);
    if (!card) throw new CardFileCorruptedError(rel);
    mutate(rawEntryList(card.doc));
    const serialized = Buffer.from(JSON.stringify(card.doc, null, 2), "utf8");
    if (serialized.equals(original)) return sha256(original);
    if (serialized.length > MAX_CARD_FILE_SIZE) throw new CardTooLargeError(rel);
    const tmp = tmpPathFor(absPath);
    try {
      await fs.writeFile(tmp, serialized);
      await fs.rename(tmp, absPath);
    } catch {
      await fs.rm(tmp, { force: true });
      throw new CardWriteFailedError(rel);
    }
    try {
      const reread = await fs.readFile(absPath);
      if (!toParsedCard(reread)) throw new Error("reread verification failed");
    } catch {
      await fs.writeFile(absPath, original).catch(() => undefined);
      cache.invalidateFile(absPath);
      throw new CardWriteFailedError(rel);
    }
    cache.invalidateFile(absPath);
    return sha256(serialized);
  }
}
