export type CardErrorCode =
  | "card_not_found"
  | "entry_not_found"
  | "invalid_json"
  | "invalid_field"
  | "write_failed"
  | "forbidden"
  | "too_large"
  | "bad_request";

export type CardPosition = "before_char" | "after_char";

export interface CardListItem {
  path: string;
  name: string;
  entryCount: number;
  bytes: number;
}

export interface CardMeta {
  spec: string;
  name: string;
  entryCount: number;
  enabledCount: number;
  regexCount: number;
}

export interface CardEntrySummary {
  id: number;
  comment: string;
  keys: string[];
  constant: boolean;
  enabled: boolean;
  position: string;
  insertion_order: number;
  words: number;
}

export interface CardEntry extends CardEntrySummary {
  secondary_keys: string[];
  content: string;
  selective: boolean;
  use_regex: boolean;
  extensions: unknown;
}

export interface CardSearchOpts {
  query?: string;
  fields?: Array<"keys" | "secondary_keys" | "comment" | "content">;
  onlyEnabled?: boolean;
  limit?: number;
  snippetChars?: number;
}

export interface CardSearchHit extends CardEntrySummary {
  matched: string[];
  snippet?: string;
  regexFallback?: boolean;
}

export type EntryPatch = Partial<{
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  insertion_order: number;
  enabled: boolean;
  position: CardPosition;
  use_regex: boolean;
}>;

export type CardChangeOrigin = "sdk" | "agent";

export interface CardChangeEvent {
  file: string;
  origin: CardChangeOrigin;
  sessionId?: string;
  turnSeq?: number;
  toolCallId?: string;
  summary?: string;
}

export interface CardWriteOptions {
  idempotencyKey?: string;
  toolCallId?: string;
  sessionId?: string;
}

export interface CardStore {
  list(dir?: string): Promise<CardListItem[]>;
  meta(path: string): Promise<CardMeta>;
  entries(
    path: string,
    filter?: { enabled?: boolean; constant?: boolean },
  ): Promise<CardEntrySummary[]>;
  search(path: string, opts: CardSearchOpts): Promise<CardSearchHit[]>;
  entry(path: string, id: number): Promise<CardEntry>;
  entryMany(path: string, ids: number[]): Promise<CardEntry[]>;
  updateEntry(
    path: string,
    id: number,
    patch: EntryPatch,
    opts?: CardWriteOptions,
  ): Promise<{ id: number; changed: string[] }>;
  bulkUpdate(
    path: string,
    ids: number[],
    patch: EntryPatch,
    opts?: CardWriteOptions,
  ): Promise<{ count: number }>;
  addEntry(
    path: string,
    entry: EntryPatch,
    opts?: CardWriteOptions,
  ): Promise<{ id: number }>;
  removeEntry(path: string, id: number, opts?: CardWriteOptions): Promise<{ ok: boolean }>;
  onChange(handler: (e: CardChangeEvent) => void): () => void;
}

export class CardNotFoundError extends Error {
  constructor(public file: string) {
    super(`card file not found: ${file}`);
    this.name = "CardNotFoundError";
  }
}

export class EntryNotFoundError extends Error {
  constructor(
    public file: string,
    public entryId: number,
  ) {
    super(`card entry not found: ${file}#${entryId}`);
    this.name = "EntryNotFoundError";
  }
}

export class InvalidFieldError extends Error {
  constructor(public fields: string[]) {
    super(`invalid card field: ${fields.join(", ")}`);
    this.name = "InvalidFieldError";
  }
}

export class CardFileCorruptedError extends Error {
  constructor(public file: string) {
    super(`card file corrupted (unparsable JSON): ${file}`);
    this.name = "CardFileCorruptedError";
  }
}

export class CardTooLargeError extends Error {
  constructor(public file: string) {
    super(`card file exceeds size limit: ${file}`);
    this.name = "CardTooLargeError";
  }
}

export class CardWriteFailedError extends Error {
  constructor(public file: string) {
    super(`card file write failed: ${file}`);
    this.name = "CardWriteFailedError";
  }
}
