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
  type CardEntry,
  type CardEntrySummary,
  type CardListItem,
  type CardMeta,
  type CardSearchHit,
  type CardSearchOpts,
  type CardStore,
  type EntryPatch,
} from "./types.js";

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
  const canRead = opts.canRead;
  const cache = new CardCache();

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
      _opts?: { idempotencyKey?: string },
    ): Promise<{ id: number; changed: string[] }> {
      const invalid = validatePatch(patch);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      return mutex.run(absPath, async () => {
        const changed: string[] = [];
        await withLockedDoc(absPath, rel, (list) => {
          const raw = list.find((e) => e.id === id);
          if (!raw) throw new EntryNotFoundError(rel, id);
          for (const [key, value] of Object.entries(patch)) {
            if (!sameValue(raw[key], value)) {
              raw[key] = value;
              if (!changed.includes(key)) changed.push(key);
            }
          }
        });
        return { id, changed };
      });
    },

    async bulkUpdate(
      file: string,
      ids: number[],
      patch: EntryPatch,
      _opts?: { idempotencyKey?: string },
    ): Promise<{ count: number }> {
      const invalid = validatePatch(patch);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      return mutex.run(absPath, async () => {
        await withLockedDoc(absPath, rel, (list) => {
          for (const id of ids) {
            const raw = list.find((e) => e.id === id);
            if (!raw) throw new EntryNotFoundError(rel, id);
            for (const [key, value] of Object.entries(patch)) {
              raw[key] = value;
            }
          }
        });
        return { count: ids.length };
      });
    },

    async addEntry(
      file: string,
      entry: EntryPatch,
      _opts?: { idempotencyKey?: string },
    ): Promise<{ id: number }> {
      const invalid = validatePatch(entry);
      if (invalid.length > 0) throw new InvalidFieldError(invalid);
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      return mutex.run(absPath, async () => {
        let newId = 0;
        await withLockedDoc(absPath, rel, (list) => {
          newId = list.reduce((m, e) => Math.max(m, typeof e.id === "number" ? e.id : -1), -1) + 1;
          list.push(canonicalEntry(newId, entry));
        });
        return { id: newId };
      });
    },

    async removeEntry(file: string, id: number): Promise<{ ok: boolean }> {
      const absPath = resolveCardFile(root, file);
      const rel = toPosixRelative(root, absPath);
      return mutex.run(absPath, async () => {
        await withLockedDoc(absPath, rel, (list) => {
          const idx = list.findIndex((e) => e.id === id);
          if (idx < 0) throw new EntryNotFoundError(rel, id);
          list.splice(idx, 1);
        });
        return { ok: true };
      });
    },
  };

  function tmpPathFor(absPath: string): string {
    return path.join(path.dirname(absPath), `.${path.basename(absPath)}.spcard.tmp`);
  }

  async function withLockedDoc(
    absPath: string,
    rel: string,
    mutate: (list: Array<Record<string, unknown>>) => void,
  ): Promise<void> {
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
    if (serialized.equals(original)) return;
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
  }
}
