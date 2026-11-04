import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextProjector } from "../../kernel/capability.js";
import type { SessionView } from "../../kernel/ports.js";
import { AccessDeniedError, ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { assertSafeSlug } from "../../store/agent-profile.js";
import { isPathInside, resolveProjectPath } from "../../utils/path-safety.js";
import { estimateTokens } from "../../context/token-estimate.js";
import { escapeXmlAttr } from "../../utils/xml-escape.js";
import { getByDotPath, splitDotPath, stripReservedKeys } from "./dot-path.js";
import { toPosixRelative } from "./path-guard.js";
import { userSegmentIndex } from "../shared/user-segments.js";

const DATA_LINK_EXTENSION = ".data.json";
const STATE_KEY = "$state";

export interface StateLinkDeclaration {
  path: string;
  label?: string;
  enabled?: boolean;
}

export interface AgentDataLink {
  name: string;
  target: string;
  dangling: boolean;
  hasState: boolean;
  statePath?: string;
  estimatedTokens: number;
}

export interface AddAgentDataLinkOptions {
  statePath?: string;
  label?: string;
}

export interface StateBlock {
  file: string;
  declaration: StateLinkDeclaration;
  value: unknown;
}

export function readStateDeclaration(doc: unknown): StateLinkDeclaration | null {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
  const raw = (doc as Record<string, unknown>)[STATE_KEY];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.length === 0) return null;
  const declaration: StateLinkDeclaration = { path: record.path };
  if (typeof record.label === "string") declaration.label = record.label;
  if (typeof record.enabled === "boolean") declaration.enabled = record.enabled;
  return declaration;
}

function assertDataLinkName(name: string): void {
  if (
    !name.endsWith(DATA_LINK_EXTENSION) ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..")
  ) {
    throw new ValidationError("link name must be a plain *.data.json file name");
  }
}

function agentDataDir(projectRoot: string, slug: string): string {
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

function ensureDeclarationNode(doc: Record<string, unknown>, statePath: string): void {
  if (statePath === ".") return;
  const segments = splitDotPath(statePath);
  if (!segments) {
    throw new ValidationError(`invalid state path: ${statePath}`);
  }
  let current: unknown = doc;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      throw new ValidationError(`state path traverses a non-object: ${statePath}`);
    }
    const record = current as Record<string, unknown>;
    const next = record[segment];
    if (next === undefined) {
      const created: Record<string, unknown> = {};
      record[segment] = created;
      current = created;
      continue;
    }
    current = next;
  }
}

function writeJsonAtomic(realPath: string, doc: unknown): void {
  const tmp = path.join(path.dirname(realPath), `.${path.basename(realPath)}.spstate.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  fs.renameSync(tmp, realPath);
}

function parseJsonFile(realPath: string, relPath: string): Record<string, unknown> {
  let doc: unknown;
  try {
    doc = JSON.parse(fs.readFileSync(realPath, "utf8"));
  } catch {
    throw new ValidationError(`link target is not valid JSON: ${relPath}`);
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new ValidationError(`link target must be a JSON object: ${relPath}`);
  }
  return doc as Record<string, unknown>;
}

function ensureStateDeclaration(
  realPath: string,
  relPath: string,
  options?: AddAgentDataLinkOptions,
): void {
  if (options?.statePath !== undefined) {
    if (typeof options.statePath !== "string" || options.statePath.length === 0) {
      throw new ValidationError("state_path must be a non-empty string");
    }
    if (options.statePath !== "." && !splitDotPath(options.statePath)) {
      throw new ValidationError(`invalid state path: ${options.statePath}`);
    }
  }
  if (options?.label !== undefined && typeof options.label !== "string") {
    throw new ValidationError("label must be a string");
  }
  const doc = parseJsonFile(realPath, relPath);
  const existing = readStateDeclaration(doc);
  const declaration: StateLinkDeclaration = {
    path: options?.statePath ?? existing?.path ?? "_state",
  };
  const label = options?.label ?? existing?.label;
  if (label !== undefined) declaration.label = label;
  if (typeof existing?.enabled === "boolean") declaration.enabled = existing.enabled;
  const unchanged =
    existing !== null &&
    existing.path === declaration.path &&
    existing.label === declaration.label &&
    existing.enabled === declaration.enabled;
  const nodeExists = !getByDotPath(doc, declaration.path).missing;
  if (unchanged && nodeExists) return;
  ensureDeclarationNode(doc, declaration.path);
  doc[STATE_KEY] = declaration;
  writeJsonAtomic(realPath, doc);
}

interface CachedState {
  fingerprint: string;
  blocks: StateBlock[];
}

const stateCache = new Map<string, CachedState>();

function cacheKey(projectRoot: string, slug: string): string {
  return `${projectRoot}\0${slug}`;
}

export function invalidateStateLinkCache(projectRoot?: string, slug?: string): void {
  if (projectRoot === undefined) {
    stateCache.clear();
    statsCache.clear();
    return;
  }
  for (const key of [...stateCache.keys()]) {
    if (
      slug !== undefined
        ? key === cacheKey(projectRoot, slug)
        : key.startsWith(`${projectRoot}\0`)
    ) {
      stateCache.delete(key);
    }
  }
  const root = path.resolve(projectRoot);
  for (const key of [...statsCache.keys()]) {
    if (isPathInside(root, key)) {
      statsCache.delete(key);
    }
  }
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
    if (!name.endsWith(DATA_LINK_EXTENSION)) continue;
    try {
      const fileStat = fs.statSync(path.join(dir, name));
      parts.push(`${name}:${fileStat.mtimeMs}:${fileStat.size}`);
    } catch {
      continue;
    }
  }
  return parts.join("|");
}

function readLinkedState(
  projectRoot: string,
  linkPath: string,
): { file: string; block: StateBlock } | null {
  if (fs.lstatSync(linkPath).isSymbolicLink()) {
    const real = linkTargetRealpath(linkPath);
    if (real === null || !isPathInside(projectRoot, real)) return null;
    const targetStat = fs.statSync(linkPath);
    if (!targetStat.isFile()) return null;
    return readTargetState(projectRoot, real);
  }
  return null;
}

function readTargetState(
  projectRoot: string,
  real: string,
): { file: string; block: StateBlock } | null {
  let doc: unknown;
  try {
    doc = JSON.parse(fs.readFileSync(real, "utf8"));
  } catch {
    return null;
  }
  const declaration = readStateDeclaration(doc);
  if (!declaration || declaration.enabled === false) return null;
  const resolved = getByDotPath(doc, declaration.path);
  if (resolved.missing) return null;
  const value =
    typeof resolved.value === "object" && resolved.value !== null && !Array.isArray(resolved.value)
      ? stripReservedKeys(resolved.value as Record<string, unknown>)
      : resolved.value;
  const file = toPosixRelative(projectRoot, real);
  return { file, block: { file, declaration, value } };
}

export function readAgentState(projectRoot: string, slug: string): StateBlock[] {
  const key = cacheKey(projectRoot, slug);
  const dir = agentDataDir(projectRoot, slug);
  const fingerprint = fingerprintDir(dir);
  if (fingerprint === null) {
    stateCache.delete(key);
    return [];
  }
  const cached = stateCache.get(key);
  if (cached && cached.fingerprint === fingerprint) return cached.blocks;
  const root = path.resolve(projectRoot);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    stateCache.delete(key);
    return [];
  }
  const blocks: StateBlock[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(DATA_LINK_EXTENSION)) continue;
    const full = path.join(dir, name);
    try {
      const found = readLinkedState(root, full);
      if (found) blocks.push(found.block);
    } catch {
      continue;
    }
  }
  stateCache.set(key, { fingerprint, blocks });
  return blocks;
}

const EMPTY_STATS = { hasState: false, statePath: undefined as string | undefined, estimatedTokens: 0 };

const statsCache = new Map<string, { fingerprint: string; stats: Omit<AgentDataLink, "name" | "target" | "dangling"> }>();

function statsOfDataFile(
  projectRoot: string,
  real: string,
): Omit<AgentDataLink, "name" | "target" | "dangling"> {
  let fingerprint: string;
  try {
    const fileStat = fs.statSync(real);
    if (!fileStat.isFile()) return EMPTY_STATS;
    fingerprint = `${fileStat.mtimeMs}:${fileStat.size}`;
  } catch {
    return EMPTY_STATS;
  }
  const cached = statsCache.get(real);
  if (cached && cached.fingerprint === fingerprint) return cached.stats;
  let stats: Omit<AgentDataLink, "name" | "target" | "dangling"> = EMPTY_STATS;
  try {
    const found = readTargetState(projectRoot, real);
    if (found) {
      stats = {
        hasState: true,
        statePath: found.block.declaration.path,
        estimatedTokens: estimateTokens(
          renderStateBlock(found.file, found.block.declaration, found.block.value),
        ),
      };
    }
  } catch {
    stats = EMPTY_STATS;
  }
  statsCache.set(real, { fingerprint, stats });
  return stats;
}

export function listAgentDataLinks(projectRoot: string, slug: string): AgentDataLink[] {
  const dir = agentDataDir(projectRoot, slug);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const root = path.resolve(projectRoot);
  const out: AgentDataLink[] = [];
  for (const name of names) {
    if (!name.endsWith(DATA_LINK_EXTENSION)) continue;
    const full = path.join(dir, name);
    try {
      if (!fs.lstatSync(full).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const real = linkTargetRealpath(full);
    const outside = real !== null && !isPathInside(root, real);
    const dangling = real === null || outside;
    const stats = !dangling && real !== null ? statsOfDataFile(root, real) : EMPTY_STATS;
    out.push({
      name,
      target: real === null ? "" : toPosixRelative(root, real),
      dangling,
      ...stats,
    });
  }
  return out;
}

export function addAgentDataLink(
  projectRoot: string,
  slug: string,
  targetRelPath: string,
  options?: AddAgentDataLinkOptions,
): AgentDataLink {
  const root = path.resolve(projectRoot);
  const targetAbs = resolveProjectPath(root, targetRelPath);
  let targetStat: fs.Stats;
  try {
    targetStat = fs.statSync(targetAbs);
  } catch {
    throw new NotFoundError(`data file not found: ${targetRelPath}`);
  }
  if (!targetStat.isFile()) throw new ValidationError("link target must be a file");
  let targetReal: string;
  try {
    targetReal = fs.realpathSync(targetAbs);
  } catch {
    throw new NotFoundError(`data file not found: ${targetRelPath}`);
  }
  if (!isPathInside(root, targetReal)) {
    throw new AccessDeniedError(`link target escapes project: ${targetRelPath}`);
  }
  const name = path.basename(targetAbs);
  assertDataLinkName(name);
  const dir = agentDataDir(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  const linkPath = path.join(dir, name);
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) {
      const existing = linkTargetRealpath(linkPath);
      if (existing === targetReal) {
        ensureStateDeclaration(targetReal, targetRelPath, options);
        invalidateStateLinkCache(root, slug);
        return {
          name,
          target: toPosixRelative(root, targetReal),
          dangling: false,
          ...statsOfDataFile(root, targetReal),
        };
      }
      throw new ConflictError(`data link already exists: ${name}`);
    }
    throw new ConflictError(`data file already exists: ${name}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  ensureStateDeclaration(targetReal, targetRelPath, options);
  try {
    fs.symlinkSync(path.relative(dir, targetAbs), linkPath, "file");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EPERM" || code === "EACCES") {
      throw new ValidationError("creating symlinks requires privileges on Windows (admin or Developer Mode)");
    }
    if (code === "EEXIST") {
      throw new ConflictError(`data link already exists: ${name}`);
    }
    throw err;
  }
  invalidateStateLinkCache(root, slug);
  return {
    name,
    target: toPosixRelative(root, targetReal),
    dangling: false,
    ...statsOfDataFile(root, targetReal),
  };
}

export function removeAgentDataLink(projectRoot: string, slug: string, name: string): void {
  assertDataLinkName(name);
  const linkPath = path.join(agentDataDir(projectRoot, slug), name);
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) {
      throw new ValidationError("not a data link, refusing to delete");
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new NotFoundError(`data link not found: ${name}`);
  }
  fs.unlinkSync(linkPath);
  invalidateStateLinkCache(path.resolve(projectRoot), slug);
}

export function renderStateBlock(
  file: string,
  declaration: StateLinkDeclaration,
  value: unknown,
): string {
  const attrs = [`file="${escapeXmlAttr(file)}"`, `path="${escapeXmlAttr(declaration.path)}"`];
  if (declaration.label !== undefined) attrs.push(`label="${escapeXmlAttr(declaration.label)}"`);
  return `<state ${attrs.join(" ")}>\n${JSON.stringify(value ?? null, null, 2)}\n</state>`;
}

export const stateProjector: ContextProjector = (view: SessionView) => {
  const projectRoot = view.projectStore.getRootPath();
  const slug = view.profile.slug;
  return (messages) => {
    const blocks = readAgentState(projectRoot, slug);
    if (blocks.length === 0) return [...messages];
    const content = blocks.map((b) => renderStateBlock(b.file, b.declaration, b.value)).join("\n");
    const block = { role: "user", content } as AgentMessage;
    const index = userSegmentIndex(messages, 1);
    return [...messages.slice(0, index), block, ...messages.slice(index)];
  };
};
