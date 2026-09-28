import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextProjector } from "../../kernel/capability.js";
import type { SessionView } from "../../kernel/ports.js";
import { AccessDeniedError, ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { assertSafeSlug } from "../../store/agent-profile.js";
import { isPathInside, resolveProjectPath } from "../../utils/path-safety.js";
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

function orderOf(entry: CardEntry): number {
  return Number.isFinite(entry.insertion_order) ? entry.insertion_order : 0;
}

export function matchWorldbook(recentText: string, entries: CardEntry[]): CardEntry[] {
  const matched: CardEntry[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.constant) {
      matched.push(entry);
      continue;
    }
    if (entry.selective) {
      if (entry.keys.length === 0 || entry.secondary_keys.length === 0) continue;
      const primaryHit = matchKeys({ ...entry, keys: entry.keys, secondary_keys: [] }, recentText).hit;
      if (!primaryHit) continue;
      const secondaryHit = matchKeys({ ...entry, keys: [], secondary_keys: entry.secondary_keys }, recentText).hit;
      if (secondaryHit) matched.push(entry);
      continue;
    }
    const keys = [...entry.keys, ...entry.secondary_keys];
    if (keys.length === 0) continue;
    if (matchKeys({ ...entry, keys, secondary_keys: [] }, recentText).hit) {
      matched.push(entry);
    }
  }
  matched.sort((a, b) => orderOf(a) - orderOf(b));
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
  const ranked = entries.slice().sort((a, b) => orderOf(a) - orderOf(b));
  for (const entry of ranked.slice(0, maxEntries)) {
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
    let args = "";
    if (typed.arguments !== undefined) {
      try {
        args = JSON.stringify(typed.arguments);
      } catch {
        args = "";
      }
    }
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

const WORLDBOOK_BLOCK_PATTERN = /<worldbook>[\s\S]*?<\/worldbook>/g;

export function recentTextOf(messages: readonly AgentMessage[]): string {
  const chunks: string[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && chunks.length < RECENT_SCAN_MESSAGES; i--) {
    const text = messageText(messages[i]).replace(WORLDBOOK_BLOCK_PATTERN, "");
    if (!text) continue;
    chunks.unshift(text);
    chars += text.length;
    if (chars >= RECENT_SCAN_CHARS) break;
  }
  return chunks.join("\n");
}

interface CachedBook {
  fingerprint: string;
  entries: CardEntry[];
}

const bookCache = new Map<string, CachedBook>();

function cacheKey(projectRoot: string, slug: string): string {
  return `${projectRoot}\0${slug}`;
}

export function invalidateWorldbookCache(projectRoot?: string, slug?: string): void {
  if (projectRoot === undefined) {
    bookCache.clear();
    return;
  }
  for (const key of [...bookCache.keys()]) {
    if (
      slug !== undefined
        ? key === cacheKey(projectRoot, slug)
        : key.startsWith(`${projectRoot}\0`)
    ) {
      bookCache.delete(key);
    }
  }
}

function agentCardsDir(projectRoot: string, slug: string): string {
  assertSafeSlug(slug);
  return path.join(path.resolve(projectRoot), ".spherse", "agents", slug);
}

function linkTargetRealpath(linkPath: string): string | null {
  try {
    return fs.realpathSync(linkPath);
  } catch {
    return null;
  }
}

function loadAgentCards(projectRoot: string, dir: string): CardEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const entries: CardEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".card.json")) continue;
    const full = path.join(dir, name);
    try {
      if (fs.lstatSync(full).isSymbolicLink()) {
        const real = linkTargetRealpath(full);
        if (real === null || !isPathInside(projectRoot, real)) continue;
        const targetStat = fs.statSync(full);
        if (!targetStat.isFile()) continue;
      }
      const parsed = toParsedCard(fs.readFileSync(full));
      if (parsed) entries.push(...parsed.entries);
    } catch {
      continue;
    }
  }
  return entries;
}

function fingerprintDir(dir: string): string | null {
  let dirStat: fs.Stats;
  try {
    dirStat = fs.statSync(dir);
  } catch {
    return null;
  }
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const parts = [`dir:${dirStat.mtimeMs}`];
  for (const name of names) {
    if (!name.endsWith(".card.json")) continue;
    try {
      const fileStat = fs.statSync(path.join(dir, name));
      parts.push(`${name}:${fileStat.mtimeMs}:${fileStat.size}`);
    } catch {
      continue;
    }
  }
  return parts.join("|");
}

export function readAgentWorldbook(projectRoot: string, slug: string): CardEntry[] {
  const key = cacheKey(projectRoot, slug);
  const dir = agentCardsDir(projectRoot, slug);
  const fingerprint = fingerprintDir(dir);
  if (fingerprint === null) {
    bookCache.delete(key);
    return [];
  }
  const cached = bookCache.get(key);
  if (cached && cached.fingerprint === fingerprint) return cached.entries;
  const entries = loadAgentCards(path.resolve(projectRoot), dir);
  bookCache.set(key, { fingerprint, entries });
  return entries;
}

export interface AgentCardLink {
  name: string;
  target: string;
  dangling: boolean;
}

function assertLinkName(name: string): void {
  if (!name.endsWith(".card.json") || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new ValidationError("link name must be a plain *.card.json file name");
  }
}

export function listAgentCardLinks(projectRoot: string, slug: string): AgentCardLink[] {
  const dir = agentCardsDir(projectRoot, slug);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const root = path.resolve(projectRoot);
  const out: AgentCardLink[] = [];
  for (const name of names) {
    if (!name.endsWith(".card.json")) continue;
    const full = path.join(dir, name);
    try {
      if (!fs.lstatSync(full).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const real = linkTargetRealpath(full);
    const outside = real !== null && !isPathInside(root, real);
    out.push({
      name,
      target: real === null ? "" : path.relative(root, real),
      dangling: real === null || outside,
    });
  }
  return out;
}

export function addAgentCardLink(projectRoot: string, slug: string, targetRelPath: string): AgentCardLink {
  const root = path.resolve(projectRoot);
  const targetAbs = resolveProjectPath(root, targetRelPath);
  let targetStat: fs.Stats;
  try {
    targetStat = fs.statSync(targetAbs);
  } catch {
    throw new NotFoundError(`card file not found: ${targetRelPath}`);
  }
  if (!targetStat.isFile()) throw new ValidationError("link target must be a file");
  let targetReal: string;
  try {
    targetReal = fs.realpathSync(targetAbs);
  } catch {
    throw new NotFoundError(`card file not found: ${targetRelPath}`);
  }
  if (!isPathInside(root, targetReal)) {
    throw new AccessDeniedError(`link target escapes project: ${targetRelPath}`);
  }
  const name = path.basename(targetAbs);
  assertLinkName(name);
  const dir = agentCardsDir(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  const linkPath = path.join(dir, name);
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) {
      const existing = linkTargetRealpath(linkPath);
      if (existing === targetAbs) {
        invalidateWorldbookCache(root, slug);
        return { name, target: path.relative(root, targetAbs), dangling: false };
      }
      throw new ConflictError(`card link already exists: ${name}`);
    }
    throw new ConflictError(`card file already exists: ${name}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  try {
    fs.symlinkSync(path.relative(dir, targetAbs), linkPath, "file");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EPERM" || code === "EACCES") {
      throw new ValidationError("creating symlinks requires privileges on Windows (admin or Developer Mode)");
    }
    if (code === "EEXIST") {
      throw new ConflictError(`card link already exists: ${name}`);
    }
    throw err;
  }
  invalidateWorldbookCache(root, slug);
  return { name, target: path.relative(root, targetAbs), dangling: false };
}

export function removeAgentCardLink(projectRoot: string, slug: string, name: string): void {
  assertLinkName(name);
  const linkPath = path.join(agentCardsDir(projectRoot, slug), name);
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) {
      throw new ValidationError("not a card link, refusing to delete");
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new NotFoundError(`card link not found: ${name}`);
  }
  fs.unlinkSync(linkPath);
  invalidateWorldbookCache(path.resolve(projectRoot), slug);
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
