import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextProjector } from "../../kernel/capability.js";
import type { SessionView } from "../../kernel/ports.js";
import { estimateTokens } from "../../context/token-estimate.js";
import { toParsedCard } from "./parser.js";
import { matchKeys } from "./search.js";
import { escapeXmlAttr } from "../../utils/xml-escape.js";
import type { CardEntry } from "./types.js";

export const WORLDBOOK_MAX_ENTRIES = 8;
export const WORLDBOOK_MAX_TOKENS = 2000;
const RECENT_SCAN_MESSAGES = 10;
const RECENT_SCAN_CHARS = 4000;

export interface WorldbookBudget {
  maxEntries?: number;
  maxTokens?: number;
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function matchWorldbook(recentText: string, entries: CardEntry[]): CardEntry[] {
  const matched: CardEntry[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.constant) {
      matched.push(entry);
      continue;
    }
    const keys = entry.selective ? entry.secondary_keys : [...entry.keys, ...entry.secondary_keys];
    if (keys.length === 0) continue;
    if (matchKeys({ ...entry, keys, secondary_keys: [] }, recentText).hit) {
      matched.push(entry);
    }
  }
  matched.sort((a, b) => a.insertion_order - b.insertion_order);
  return matched;
}

export function renderWorldbookEntry(entry: CardEntry): string {
  const keys = [...entry.keys, ...entry.secondary_keys].filter(Boolean).join("|");
  return `<entry${keys ? ` keys="${escapeXmlAttr(keys)}"` : ""}>${escapeXmlText(entry.content)}</entry>`;
}

export function applyWorldbookBudget(entries: CardEntry[], budget?: WorldbookBudget): CardEntry[] {
  const maxEntries = Math.max(0, budget?.maxEntries ?? WORLDBOOK_MAX_ENTRIES);
  const maxTokens = Math.max(0, budget?.maxTokens ?? WORLDBOOK_MAX_TOKENS);
  const out: CardEntry[] = [];
  let tokens = 0;
  for (const entry of entries.slice(0, maxEntries)) {
    const cost = estimateTokens(renderWorldbookEntry(entry));
    if (out.length > 0 && tokens + cost > maxTokens) break;
    out.push(entry);
    tokens += cost;
  }
  return out;
}

function blockText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const typed = block as { type?: unknown; text?: unknown; name?: unknown; arguments?: unknown };
  if (typed.type === "text" && typeof typed.text === "string") return typed.text;
  if (typed.type === "toolCall") {
    const args = typed.arguments !== undefined ? JSON.stringify(typed.arguments) : "";
    return `${typeof typed.name === "string" ? typed.name : ""} ${args}`;
  }
  return "";
}

function messageText(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(blockText).join("");
  return "";
}

export function recentTextOf(messages: readonly AgentMessage[]): string {
  const chunks: string[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && chunks.length < RECENT_SCAN_MESSAGES; i--) {
    const text = messageText(messages[i]);
    if (!text) continue;
    chunks.unshift(text);
    chars += text.length;
    if (chars >= RECENT_SCAN_CHARS) break;
  }
  return chunks.join("\n");
}

interface CachedBook {
  mtimeMs: number;
  entries: CardEntry[];
}

const bookCache = new Map<string, CachedBook>();

function cacheKey(projectRoot: string, slug: string): string {
  return `${projectRoot}${slug}`;
}

export function invalidateWorldbookCache(projectRoot?: string, slug?: string): void {
  if (projectRoot === undefined) {
    bookCache.clear();
    return;
  }
  for (const key of [...bookCache.keys()]) {
    if (slug !== undefined ? key === cacheKey(projectRoot, slug) : key.startsWith(projectRoot)) {
      bookCache.delete(key);
    }
  }
}

function loadAgentCards(dir: string): CardEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const entries: CardEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".card.json")) continue;
    try {
      const parsed = toParsedCard(fs.readFileSync(path.join(dir, name)));
      if (parsed) entries.push(...parsed.entries);
    } catch {
      continue;
    }
  }
  return entries;
}

export function readAgentWorldbook(projectRoot: string, slug: string): CardEntry[] {
  const key = cacheKey(projectRoot, slug);
  const dir = path.join(projectRoot, ".spherse", "agents", slug);
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    bookCache.delete(key);
    return [];
  }
  const cached = bookCache.get(key);
  if (cached && cached.mtimeMs === mtimeMs) return cached.entries;
  const entries = loadAgentCards(dir);
  bookCache.set(key, { mtimeMs, entries });
  return entries;
}

export function renderWorldbook(entries: CardEntry[]): string {
  return `<worldbook>\n${entries.map(renderWorldbookEntry).join("\n")}\n</worldbook>`;
}

export const worldbookProjector: ContextProjector = (view: SessionView) => {
  const projectRoot = view.projectStore.getRootPath();
  const slug = view.profile.slug;
  return (messages) => {
    const entries = readAgentWorldbook(projectRoot, slug);
    if (entries.length === 0) return [...messages];
    const hits = applyWorldbookBudget(matchWorldbook(recentTextOf(messages), entries));
    if (hits.length === 0) return [...messages];
    return [...messages, { role: "user", content: renderWorldbook(hits) } as AgentMessage];
  };
};
