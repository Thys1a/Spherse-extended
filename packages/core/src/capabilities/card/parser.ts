import type { CardEntry } from "./types.js";

export interface ParsedCard {
  spec: string;
  name: string;
  entryCount: number;
  bytes: number;
  doc: Record<string, unknown>;
  entries: CardEntry[];
  regexCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function normalizeEntry(raw: unknown): CardEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "number" || !Number.isInteger(raw.id) || raw.id < 0) return null;
  const content = typeof raw.content === "string" ? raw.content : "";
  return {
    id: raw.id,
    keys: asStringArray(raw.keys),
    secondary_keys: asStringArray(raw.secondary_keys),
    comment: typeof raw.comment === "string" ? raw.comment : "",
    content,
    constant: raw.constant === true,
    selective: raw.selective === true,
    insertion_order: typeof raw.insertion_order === "number" ? raw.insertion_order : 0,
    enabled: raw.enabled !== false,
    position: typeof raw.position === "string" ? raw.position : "",
    use_regex: raw.use_regex === true,
    extensions: raw.extensions ?? {},
    words: content.length,
  };
}

export function parseCardBytes(buf: Buffer): {
  doc: Record<string, unknown>;
  spec: string;
  name: string;
  entries: CardEntry[];
  regexCount: number;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const data = isRecord(parsed.data) ? parsed.data : null;
  const book = data && isRecord(data.character_book) ? data.character_book : null;
  const rawEntries = book && Array.isArray(book.entries) ? book.entries : null;
  if (!rawEntries) return null;
  const entries: CardEntry[] = [];
  for (const raw of rawEntries) {
    const entry = normalizeEntry(raw);
    if (entry) entries.push(entry);
  }
  const dataExtensions = data && isRecord(data.extensions) ? data.extensions : null;
  const regexScripts =
    dataExtensions && Array.isArray(dataExtensions.regex_scripts)
      ? dataExtensions.regex_scripts
      : [];
  const cardName =
    typeof data?.name === "string" && data.name
      ? data.name
      : typeof parsed.name === "string"
        ? parsed.name
        : "";
  return {
    doc: parsed,
    spec: typeof parsed.spec === "string" ? parsed.spec : "",
    name: cardName,
    entries,
    regexCount: regexScripts.length,
  };
}

export function toParsedCard(buf: Buffer): ParsedCard | null {
  const parsed = parseCardBytes(buf);
  if (!parsed) return null;
  return {
    spec: parsed.spec,
    name: parsed.name,
    entryCount: parsed.entries.length,
    bytes: buf.length,
    doc: parsed.doc,
    entries: parsed.entries,
    regexCount: parsed.regexCount,
  };
}
