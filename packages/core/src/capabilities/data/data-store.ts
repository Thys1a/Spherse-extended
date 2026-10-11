import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileWriteMutex } from "../../utils/file-write-mutex.js";
import type { Logger } from "../../logger.js";
import { overUndoMirrorCap, type ToolAttributionRegistry, type UndoOp, type UndoRecord } from "../../tool-attribution.js";
import { OutlineCache } from "./outline-cache.js";
import { buildOutline } from "./outline.js";
import { checkManifestHealth, readManifestWithDiagnosticsFromDoc } from "./manifest.js";
import { deleteByDotPath, getByDotPath, getRawByDotPath, setByDotPath } from "./dot-path.js";
import { runQuery, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./query-engine.js";
import { validateMutationArgs } from "./validate.js";
import { isReservedKey, resolveDataFile, toPosixRelative } from "./path-guard.js";
import {
  DataFileCorruptedError,
  ForbiddenKeyError,
  ManifestStaleError,
  UnknownEntryError,
  VersionConflictError,
  type DataChangeEvent,
  type DataOrigin,
  type DataStore,
  type ManifestMutation,
  type MutateResult,
  type OutlineResult,
  type QueryResult,
  type ReadResult,
  type WriteResult,
} from "./types.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const IDEMPOTENCY_CACHE_CAPACITY = 1024;

interface LoadedDoc {
  doc: Record<string, unknown>;
  version: string;
  existed: boolean;
}

export interface CreateDataStoreOptions {
  projectRoot: string;
  fileWriteMutex: FileWriteMutex;
  logger: Logger;
  attribution?: ToolAttributionRegistry;
}

export function createDataStore(opts: CreateDataStoreOptions): DataStore {
  const root = path.resolve(opts.projectRoot);
  const mutex = opts.fileWriteMutex;
  const logger = opts.logger;
  const attributionRegistry = opts.attribution;
  const outlineCache = new OutlineCache(64);
  const changeHandlers = new Set<(e: DataChangeEvent) => void>();
  const idempotencyCache = new Map<string, unknown>();

  function sha256(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
  }

  function tmpPathFor(absPath: string): string {
    return path.join(path.dirname(absPath), `.${path.basename(absPath)}.spdata.tmp`);
  }

  async function loadDoc(absPath: string): Promise<LoadedDoc> {
    let buf: Buffer;
    try {
      buf = await fs.readFile(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { doc: {}, version: sha256(Buffer.alloc(0)), existed: false };
      }
      throw err;
    }
    if (buf.length > MAX_FILE_SIZE) {
      throw new Error(`data file exceeds 20MB limit: ${toPosixRelative(root, absPath)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch {
      throw new DataFileCorruptedError(toPosixRelative(root, absPath));
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new DataFileCorruptedError(toPosixRelative(root, absPath));
    }
    return { doc: parsed as Record<string, unknown>, version: sha256(buf), existed: true };
  }

  let pendingEvents: DataChangeEvent[] = [];

  function flushEvents(): void {
    const events = pendingEvents;
    pendingEvents = [];
    for (const event of events) {
      for (const handler of changeHandlers) {
        try {
          handler(event);
        } catch (err) {
          logger.warn({ err, file: event.file }, "data change handler failed");
        }
      }
    }
  }

  async function readBytesForVersion(absPath: string): Promise<LoadedDoc> {
    return loadDoc(absPath);
  }

  async function persistLocked(
    absPath: string,
    doc: Record<string, unknown>,
    origin: DataOrigin,
    summary?: string,
    attribution?: { sessionId: string; toolCallId?: string },
    undo?: UndoRecord,
  ): Promise<string> {
    const content = JSON.stringify(doc, null, 2);
    const buf = Buffer.from(content, "utf8");
    if (buf.length > MAX_FILE_SIZE) {
      throw new Error(`data file exceeds 20MB limit: ${toPosixRelative(root, absPath)}`);
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    const tmp = tmpPathFor(absPath);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, absPath);
    const version = sha256(buf);
    outlineCache.invalidateFile(absPath);
    const resolved =
      attribution?.toolCallId !== undefined
        ? attributionRegistry?.attribute(attribution.sessionId, attribution.toolCallId)
        : undefined;
    pendingEvents.push({
      file: toPosixRelative(root, absPath),
      version,
      origin,
      ...(summary !== undefined ? { summary } : {}),
      ...(undo !== undefined ? { op: undo.op, path: undo.path, ...(undo.before !== undefined ? { before: undo.before } : {}) } : {}),
      ...(attribution !== undefined ? { sessionId: attribution.sessionId } : {}),
      ...(resolved !== undefined ? { turnSeq: resolved.turnSeq } : {}),
      ...(attribution?.toolCallId !== undefined ? { toolCallId: attribution.toolCallId } : {}),
    });
    return version;
  }

  function rememberIdempotent(absPath: string, key: string | undefined, result: unknown): void {
    if (key === undefined) return;
    const cacheKey = `${absPath}\0${key}`;
    if (idempotencyCache.has(cacheKey)) idempotencyCache.delete(cacheKey);
    idempotencyCache.set(cacheKey, result);
    while (idempotencyCache.size > IDEMPOTENCY_CACHE_CAPACITY) {
      const oldest = idempotencyCache.keys().next().value;
      if (oldest === undefined) break;
      idempotencyCache.delete(oldest);
    }
  }

  function recallIdempotent(absPath: string, key: string | undefined): unknown {
    if (key === undefined) return undefined;
    const cacheKey = `${absPath}\0${key}`;
    const value = idempotencyCache.get(cacheKey);
    if (value !== undefined) {
      idempotencyCache.delete(cacheKey);
      idempotencyCache.set(cacheKey, value);
    }
    return value;
  }

  async function writeRaw(
    file: string,
    key: string,
    apply: (doc: Record<string, unknown>) => boolean,
    ifVersion: string | undefined,
    attribution?: { sessionId: string; toolCallId?: string },
    undoMeta?: { op: "rawSet" | "rawDelete"; after?: unknown },
  ): Promise<WriteResult> {
    if (typeof key !== "string" || !key) throw new Error("key must be a non-empty string");
    if (isReservedKey(key)) throw new ForbiddenKeyError(key);
    const absPath = resolveDataFile(root, file);
    const result = await mutex.run(absPath, async () => {
      const loaded = await loadDoc(absPath);
      if (ifVersion !== undefined && loaded.version !== ifVersion) {
        throw new VersionConflictError(loaded.version);
      }
      const before = key in loaded.doc ? structuredClone(loaded.doc[key]) : undefined;
      const changed = apply(loaded.doc);
      if (!changed) return { version: loaded.version };
      const after = undoMeta?.after !== undefined ? structuredClone(undoMeta.after) : undefined;
      const undo: UndoRecord | undefined =
        undoMeta === undefined || overUndoMirrorCap(before) || overUndoMirrorCap(after)
          ? undefined
          : {
              op: undoMeta.op,
              path: key,
              ...(before !== undefined ? { before } : {}),
              ...(after !== undefined ? { after } : {}),
            };
      const version = await persistLocked(
        absPath,
        loaded.doc,
        "sdk",
        undefined,
        attribution,
        undo,
      );
      return undo === undefined ? { version } : { version, undo };
    });
    flushEvents();
    return result;
  }

  function manifestQueriesOf(raw: unknown): Record<string, unknown> {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) && typeof (raw as { queries?: unknown }).queries === "object"
      ? ((raw as { queries: Record<string, unknown> }).queries ?? {})
      : {};
  }

  function manifestMutationsOf(raw: unknown): Record<string, unknown> {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) && typeof (raw as { mutations?: unknown }).mutations === "object"
      ? ((raw as { mutations: Record<string, unknown> }).mutations ?? {})
      : {};
  }

  function applyMutation(
    doc: Record<string, unknown>,
    mutation: ManifestMutation,
    args: Record<string, unknown>,
    entryName: string,
    validNames: string[],
  ): { result: unknown; index?: number; previous?: unknown } {
    const validated = validateMutationArgs(mutation, args);
    const target = getByDotPath(doc, mutation.path);

    if (mutation.op === "append") {
      if (target.missing || !Array.isArray(target.value)) {
        throw new ManifestStaleError(entryName, "mutation", validNames);
      }
      const row: Record<string, unknown> = { ...validated.value };
      for (const [field, gen] of Object.entries(mutation.auto ?? {})) {
        if (field === mutation.match) continue;
        row[field] = gen === "uuid" ? randomUUID() : new Date().toISOString();
      }
      target.value.push(row);
      return { result: row, index: target.value.length - 1 };
    }

    if (mutation.op === "update" || mutation.op === "remove") {
      if (target.missing || !Array.isArray(target.value)) {
        throw new ManifestStaleError(entryName, "mutation", validNames);
      }
      if (!mutation.match) throw new Error(`mutation "${mutation.op}" requires a match field`);
      const matchValue = validated.value[mutation.match];
      const idx = target.value.findIndex(
        (r) => typeof r === "object" && r !== null && !Array.isArray(r) && (r as Record<string, unknown>)[mutation.match!] === matchValue,
      );
      if (idx < 0) {
        throw new Error(`no entry with ${mutation.match}=${JSON.stringify(matchValue)} in ${mutation.path}`);
      }
      if (mutation.op === "remove") {
        const [removed] = target.value.splice(idx, 1);
        return { result: removed, index: idx };
      }
      const row = target.value[idx] as Record<string, unknown>;
      const previousRow = structuredClone(row);
      for (const [field, value] of Object.entries(validated.value)) {
        if (field === mutation.match) continue;
        const prev = row[field];
        if (
          typeof prev === "object" && prev !== null && !Array.isArray(prev) &&
          typeof value === "object" && value !== null && !Array.isArray(value)
        ) {
          row[field] = { ...(prev as Record<string, unknown>), ...(value as Record<string, unknown>) };
          continue;
        }
        row[field] = value;
      }
      for (const [field, gen] of Object.entries(mutation.auto ?? {})) {
        if (field === mutation.match || validated.value[field] !== undefined) continue;
        row[field] = gen === "uuid" ? randomUUID() : new Date().toISOString();
      }
      return { result: row, previous: previousRow };
    }

    if (mutation.op === "set") {
      const parentPath = mutation.path.includes(".")
        ? mutation.path.slice(0, mutation.path.lastIndexOf("."))
        : ".";
      const leaf = mutation.path.includes(".") ? mutation.path.slice(mutation.path.lastIndexOf(".") + 1) : mutation.path;
      const parent = getRawByDotPath(doc, parentPath);
      if (parent.missing || typeof parent.value !== "object" || parent.value === null || Array.isArray(parent.value)) {
        throw new ManifestStaleError(entryName, "mutation", validNames);
      }
      const patch: Record<string, unknown> = { ...validated.value };
      for (const [field, gen] of Object.entries(mutation.auto ?? {})) {
        patch[field] = gen === "uuid" ? randomUUID() : new Date().toISOString();
      }
      const target = (parent.value as Record<string, unknown>)[leaf];
      // NOTE (game-engine R1.1): shallow merge = whole-leaf replacement for
      // nested objects. Arrays are never merged element-wise; use
      // append/update/remove for element-level changes.
      (parent.value as Record<string, unknown>)[leaf] = {
        ...(typeof target === "object" && target !== null && !Array.isArray(target) ? target : {}),
        ...patch,
      };
      return { result: (parent.value as Record<string, unknown>)[leaf] };
    }

    throw new Error(`unsupported mutation op: ${mutation.op}`);
  }

  async function mutateImpl(
    absPath: string,
    name: string,
    args: Record<string, unknown>,
    opts:
      | { idempotencyKey?: string; origin?: DataOrigin; toolCallId?: string; sessionId?: string }
      | undefined,
  ): Promise<MutateResult> {
    const origin: DataOrigin = opts?.origin ?? "agent";
    const idemKey = opts?.idempotencyKey !== undefined ? `${name}\0${opts.idempotencyKey}` : undefined;
    const cached = recallIdempotent(absPath, idemKey);
    if (cached !== undefined) return cached as MutateResult;

    const result = await mutex.run(absPath, async () => {
      const inFlight = recallIdempotent(absPath, idemKey);
      if (inFlight !== undefined) return inFlight as MutateResult;

      const loaded = await loadDoc(absPath);
      const { manifest, diagnostics } = readManifestWithDiagnosticsFromDoc(loaded.doc);
      const invalidNote =
        diagnostics.length > 0
          ? `invalid entries: ${diagnostics.map((d) => `${d.name}: ${d.reason}`).join("; ")}`
          : undefined;
      if (!manifest) {
        throw new UnknownEntryError(
          name,
          "mutation",
          Object.keys(manifestMutationsOf(loaded.doc.$manifest)),
          invalidNote,
        );
      }
      const mutation = manifest.mutations[name];
      if (!mutation) {
        throw new UnknownEntryError(name, "mutation", Object.keys(manifest.mutations), invalidNote);
      }
      const health = checkManifestHealth(loaded.doc, manifest, diagnostics);
      if (health.staleMutations.includes(name)) {
        throw new ManifestStaleError(name, "mutation", Object.keys(manifest.mutations));
      }
      const pathTarget = getByDotPath(loaded.doc, mutation.path);
      const pathBefore = pathTarget.missing ? undefined : structuredClone(pathTarget.value);
      const applied = applyMutation(loaded.doc, mutation, args, name, Object.keys(manifest.mutations));
      const result = applied.result;
      const before = mutation.op === "update" || mutation.op === "remove" ? applied.previous ?? result : pathBefore;
      const after = structuredClone(result);
      const undo: UndoRecord | undefined =
        overUndoMirrorCap(before) || overUndoMirrorCap(after)
          ? undefined
          : {
              op: mutation.op,
              path: mutation.path,
              ...(mutation.op === "append" ? {} : before !== undefined ? { before } : {}),
              after,
              ...(applied.index !== undefined ? { index: applied.index } : {}),
            };
      const version = await persistLocked(
        absPath,
        loaded.doc,
        origin,
        name,
        opts?.sessionId !== undefined
          ? {
              sessionId: opts.sessionId,
              ...(opts.toolCallId !== undefined ? { toolCallId: opts.toolCallId } : {}),
            }
          : undefined,
        undo,
      );
      const full = { version, result, undo } satisfies MutateResult;
      rememberIdempotent(absPath, idemKey, full);
      return full;
    });
    flushEvents();
    return result;
  }

  function rowsEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function applyDataInverse(doc: Record<string, unknown>, undo: UndoRecord): UndoRecord {
    switch (undo.op) {
      case "set":
      case "rawSet":
      case "rawDelete": {
        const dualOp: UndoOp = undo.op === "rawDelete" ? "rawSet" : undo.op;
        const current = getByDotPath(doc, undo.path);
        const currentBefore = current.missing ? undefined : structuredClone(current.value);
        if (undo.before === undefined) {
          if (!deleteByDotPath(doc, undo.path)) throw new Error(`rollback target missing: ${undo.path}`);
        } else if (!setByDotPath(doc, undo.path, structuredClone(undo.before))) {
          throw new Error(`rollback target missing: ${undo.path}`);
        }
        const restored = getByDotPath(doc, undo.path);
        return {
          op: dualOp,
          path: undo.path,
          ...(currentBefore !== undefined ? { before: currentBefore } : {}),
          ...(restored.missing ? {} : { after: structuredClone(restored.value) }),
        };
      }
      case "update": {
        if (undo.before === undefined) throw new Error(`rollback record incomplete: ${undo.path}`);
        const target = getByDotPath(doc, undo.path);
        if (target.missing || !Array.isArray(target.value)) throw new Error(`rollback target missing: ${undo.path}`);
        const list = target.value as unknown[];
        const idx = list.findIndex((row) => rowsEqual(row, undo.after));
        if (idx < 0) throw new Error(`rollback target row missing: ${undo.path}`);
        const currentRow = structuredClone(list[idx]);
        list[idx] = structuredClone(undo.before);
        return { op: "update", path: undo.path, before: currentRow, after: structuredClone(undo.before) };
      }
      case "append": {
        const target = getByDotPath(doc, undo.path);
        if (target.missing || !Array.isArray(target.value)) throw new Error(`rollback target missing: ${undo.path}`);
        const list = target.value as unknown[];
        let idx = undo.index !== undefined && rowsEqual(list[undo.index], undo.after) ? undo.index : -1;
        if (idx < 0) idx = list.findIndex((row) => rowsEqual(row, undo.after));
        if (idx < 0) throw new Error(`rollback target row missing: ${undo.path}`);
        const [removed] = list.splice(idx, 1);
        return { op: "remove", path: undo.path, before: removed, index: idx };
      }
      case "remove": {
        if (undo.before === undefined) throw new Error(`rollback record incomplete: ${undo.path}`);
        const target = getByDotPath(doc, undo.path);
        if (target.missing || !Array.isArray(target.value)) throw new Error(`rollback target missing: ${undo.path}`);
        const list = target.value as unknown[];
        const arrayBefore = structuredClone(list);
        const at = undo.index !== undefined ? Math.min(Math.max(undo.index, 0), list.length) : list.length;
        list.splice(at, 0, structuredClone(undo.before));
        return { op: "append", path: undo.path, before: arrayBefore, after: structuredClone(undo.before), index: at };
      }
      default:
        throw new Error(`unsupported rollback op: ${String((undo as { op?: unknown }).op)}`);
    }
  }

  async function rollbackUndoImpl(
    file: string,
    undo: UndoRecord,
    expectedVersion: string,
    opts?: { idempotencyKey?: string; toolCallId?: string; sessionId?: string },
  ): Promise<WriteResult> {
    const absPath = resolveDataFile(root, file);
    const idemKey = opts?.idempotencyKey !== undefined ? `${absPath}\0${opts.idempotencyKey}` : undefined;
    const cached = recallIdempotent(absPath, idemKey);
    if (cached !== undefined) return cached as WriteResult;
    const result = await mutex.run(absPath, async () => {
      const inFlight = recallIdempotent(absPath, idemKey);
      if (inFlight !== undefined) return inFlight as WriteResult;
      const loaded = await loadDoc(absPath);
      if (loaded.version !== expectedVersion) throw new VersionConflictError(loaded.version);
      const dual = applyDataInverse(loaded.doc, undo);
      const version = await persistLocked(
        absPath,
        loaded.doc,
        "agent",
        `rollback:${dual.op}`,
        opts?.sessionId !== undefined
          ? {
              sessionId: opts.sessionId,
              ...(opts.toolCallId !== undefined ? { toolCallId: opts.toolCallId } : {}),
            }
          : undefined,
        dual,
      );
      const full = { version, undo: dual } satisfies WriteResult;
      rememberIdempotent(absPath, idemKey, full);
      return full;
    });
    flushEvents();
    return result;
  }

  const store: DataStore = {
    async outline(file): Promise<OutlineResult> {
      const absPath = resolveDataFile(root, file);
      let sizeBytes = 0;
      let buf: Buffer;
      try {
        buf = await fs.readFile(absPath);
        sizeBytes = buf.length;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        buf = Buffer.alloc(0);
      }
      if (buf.length > MAX_FILE_SIZE) {
        throw new Error(`data file exceeds 20MB limit: ${toPosixRelative(root, absPath)}`);
      }
      let doc: Record<string, unknown> = {};
      let parsed: unknown;
      try {
        parsed = buf.length > 0 ? JSON.parse(buf.toString("utf8")) : {};
      } catch {
        throw new DataFileCorruptedError(toPosixRelative(root, absPath));
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new DataFileCorruptedError(toPosixRelative(root, absPath));
      }
      doc = parsed as Record<string, unknown>;
      const version = sha256(buf);

      const { manifest, diagnostics } = readManifestWithDiagnosticsFromDoc(doc);
      const health = checkManifestHealth(doc, manifest, diagnostics);
      const cached = outlineCache.get(absPath, version);
      if (cached !== undefined) {
        return { file: toPosixRelative(root, absPath), sizeBytes, version, outline: cached, health };
      }
      const outline = buildOutline(doc, { file: toPosixRelative(root, absPath), version, sizeBytes, manifest, health });
      outlineCache.set(absPath, version, outline);
      return { file: toPosixRelative(root, absPath), sizeBytes, version, outline, health };
    },

    async read(file, opts): Promise<ReadResult> {
      const absPath = resolveDataFile(root, file);
      if (opts.key !== undefined && opts.path !== undefined) {
        throw new Error("key and path are mutually exclusive");
      }
      const loaded = await readBytesForVersion(absPath);
      if (opts.ifVersion !== undefined) {
        if (loaded.version !== opts.ifVersion) {
          throw new VersionConflictError(loaded.version);
        }
        return { version: loaded.version, unchanged: true };
      }
      if (opts.key !== undefined) {
        if (typeof opts.key !== "string" || !opts.key) throw new Error("key must be a non-empty string");
        if (isReservedKey(opts.key)) throw new ForbiddenKeyError(opts.key);
        const value = opts.key in loaded.doc ? loaded.doc[opts.key] : null;
        return { version: loaded.version, value };
      }
      if (opts.path === undefined) {
        const o = await store.outline(file);
        return { version: o.version, note: "outline", value: o.outline };
      }
      const result = getByDotPath(loaded.doc, opts.path);
      if (result.missing) {
        return { version: loaded.version, value: null, note: `path not found: ${opts.path}` };
      }
      if (Array.isArray(result.value)) {
        const total = result.value.length;
        const offset = Math.max(opts.offset ?? 0, 0);
        const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
        const slice = result.value.slice(offset, offset + limit);
        return {
          version: loaded.version,
          value: slice,
          total,
          offset,
          limit,
          truncated: offset + slice.length < total,
          ...(total > offset + slice.length
            ? { note: `array sliced: ${offset}..${offset + slice.length} of ${total} — pass offset=${offset + slice.length} for next page` }
            : {}),
        };
      }
      return { version: loaded.version, value: result.value };
    },

    async query(file, name, params = {}, page): Promise<QueryResult> {
      const absPath = resolveDataFile(root, file);
      const loaded = await readBytesForVersion(absPath);
      const { manifest, diagnostics } = readManifestWithDiagnosticsFromDoc(loaded.doc);
      const query = manifest?.queries[name];
      if (!query) {
        const raw = loaded.doc.$manifest;
        throw new UnknownEntryError(
          name,
          "query",
          raw === undefined ? [] : Object.keys(manifestQueriesOf(raw)),
          diagnostics.length > 0
            ? `invalid entries: ${diagnostics.map((d) => `${d.name}: ${d.reason}`).join("; ")}`
            : undefined,
        );
      }
      const health = checkManifestHealth(loaded.doc, manifest, diagnostics);
      if (health.staleQueries.includes(name)) {
        throw new ManifestStaleError(name, "query", Object.keys(manifest.queries));
      }
      const result = runQuery(loaded.doc, query, params, page);
      result.version = loaded.version;
      return result;
    },

    async mutate(file, name, args, opts): Promise<MutateResult> {
      const absPath = resolveDataFile(root, file);
      return mutateImpl(absPath, name, args, opts);
    },

    async rawSet(file, key, value, opts) {
      return writeRaw(
        file,
        key,
        (doc) => {
          if (deepEqual(doc[key], value)) return false;
          doc[key] = value;
          return true;
        },
        opts?.ifVersion,
        opts?.sessionId !== undefined
          ? {
              sessionId: opts.sessionId,
              ...(opts.toolCallId !== undefined ? { toolCallId: opts.toolCallId } : {}),
            }
          : undefined,
        { op: "rawSet", after: value },
      );
    },

    async rawDelete(file, key, opts) {
      return writeRaw(
        file,
        key,
        (doc) => {
          if (!(key in doc)) return false;
          delete doc[key];
          return true;
        },
        opts?.ifVersion,
        opts?.sessionId !== undefined
          ? {
              sessionId: opts.sessionId,
              ...(opts.toolCallId !== undefined ? { toolCallId: opts.toolCallId } : {}),
            }
          : undefined,
        { op: "rawDelete" },
      );
    },

    async rollbackUndo(file, undo, expectedVersion, opts) {
      return rollbackUndoImpl(file, undo, expectedVersion, opts);
    },

    onChange(handler) {
      changeHandlers.add(handler);
      return () => changeHandlers.delete(handler);
    },
  };

  return store;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
