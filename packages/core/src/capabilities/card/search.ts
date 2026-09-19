import type { CardEntry, CardSearchHit, CardSearchOpts } from "./types.js";

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;
export const DEFAULT_SNIPPET_CHARS = 160;
export const MAX_SNIPPET_CHARS = 2000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const REGEX_CACHE_CAPACITY = 500;
const regexCache = new Map<string, RegExp | null>();

function cachedRegExp(key: string): RegExp | null | undefined {
  const hit = regexCache.get(key);
  if (hit !== undefined) return hit;
  let compiled: RegExp | null;
  try {
    compiled = new RegExp(key, "i");
  } catch {
    compiled = null;
  }
  if (regexCache.has(key)) regexCache.delete(key);
  regexCache.set(key, compiled);
  while (regexCache.size > REGEX_CACHE_CAPACITY) {
    const oldest = regexCache.keys().next().value;
    if (oldest === undefined) break;
    regexCache.delete(oldest);
  }
  return compiled;
}

export function matchKeys(entry: CardEntry, query: string): { hit: boolean; regexFallback: boolean } {
  const keys = [...entry.keys, ...entry.secondary_keys];
  const q = query.toLowerCase();
  let fallbackHit = false;
  for (const key of keys) {
    if (!key) continue;
    if (entry.use_regex) {
      const pattern = cachedRegExp(key);
      if (pattern) {
        if (pattern.test(query)) return { hit: true, regexFallback: false };
        continue;
      }
      const k = key.toLowerCase();
      if (k.includes(q) || q.includes(k)) fallbackHit = true;
      continue;
    }
    const k = key.toLowerCase();
    if (k.includes(q) || q.includes(k)) return { hit: true, regexFallback: false };
  }
  return { hit: fallbackHit, regexFallback: fallbackHit };
}

function matchComment(entry: CardEntry, query: string): boolean {
  return entry.comment.toLowerCase().includes(query.toLowerCase());
}

function matchContent(
  entry: CardEntry,
  query: string,
  snippetChars: number,
): { hit: boolean; snippet?: string } {
  const idx = entry.content.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return { hit: false };
  const start = Math.max(0, idx - Math.floor(snippetChars / 3));
  const slice = entry.content.slice(start, start + snippetChars);
  const snippet = `${start > 0 ? "…" : ""}${slice}${start + slice.length < entry.content.length ? "…" : ""}`;
  return { hit: true, snippet };
}

export function searchEntries(entries: CardEntry[], opts: CardSearchOpts): CardSearchHit[] {
  const query = (opts.query ?? "").trim();
  if (!query) return [];
  const fields = opts.fields ?? ["keys", "comment"];
  const onlyEnabled = opts.onlyEnabled ?? true;
  const limit = clamp(opts.limit ?? DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
  const snippetChars = clamp(opts.snippetChars ?? DEFAULT_SNIPPET_CHARS, 1, MAX_SNIPPET_CHARS);

  const out: CardSearchHit[] = [];
  for (const entry of entries) {
    if (onlyEnabled && !entry.enabled) continue;
    const matched: string[] = [];
    let snippet: string | undefined;
    let regexFallback = false;
    if (fields.includes("keys") || fields.includes("secondary_keys")) {
      const r = matchKeys(entry, query);
      if (r.hit) {
        matched.push("keys");
        regexFallback = r.regexFallback;
      }
    }
    if (fields.includes("comment") && matchComment(entry, query)) matched.push("comment");
    if (fields.includes("content")) {
      const r = matchContent(entry, query, snippetChars);
      if (r.hit) {
        matched.push("content");
        snippet = r.snippet;
      }
    }
    if (matched.length === 0) continue;
    out.push({
      id: entry.id,
      comment: entry.comment,
      keys: entry.keys,
      constant: entry.constant,
      enabled: entry.enabled,
      position: entry.position,
      insertion_order: entry.insertion_order,
      words: entry.words,
      matched,
      ...(snippet !== undefined ? { snippet } : {}),
      ...(regexFallback ? { regexFallback: true } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}
