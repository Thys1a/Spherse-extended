export interface DotPathResult {
  value: unknown;
  missing: boolean;
}

const ROOT_PATH = ".";

export function isReservedSegment(segment: string): boolean {
  return segment.startsWith("$");
}

export function splitDotPath(path: string): string[] | null {
  const segments = path.split(".").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((s) => isReservedSegment(s))) return null;
  return segments;
}

export function stripReservedKeys(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (isReservedSegment(k)) continue;
    out[k] = v;
  }
  return out;
}

export function getByDotPath(root: unknown, path: string): DotPathResult {
  if (path === ROOT_PATH) {
    if (typeof root === "object" && root !== null && !Array.isArray(root)) {
      return { value: stripReservedKeys(root as Record<string, unknown>), missing: false };
    }
    return { value: undefined, missing: true };
  }
  const segments = splitDotPath(path);
  if (!segments) return { value: undefined, missing: true };

  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return { value: undefined, missing: true };
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return { value: undefined, missing: true };
    current = record[segment];
  }
  return { value: current, missing: false };
}

export function setByDotPath(root: Record<string, unknown>, path: string, value: unknown): boolean {
  if (path === ROOT_PATH) return false;
  const segments = splitDotPath(path);
  if (!segments) return false;
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return false;
    const next = (current as Record<string, unknown>)[segments[i]];
    if (typeof next !== "object" || next === null || Array.isArray(next)) return false;
    current = next;
  }
  (current as Record<string, unknown>)[segments[segments.length - 1]] = value;
  return true;
}

export function deleteByDotPath(root: Record<string, unknown>, path: string): boolean {
  if (path === ROOT_PATH) return false;
  const segments = splitDotPath(path);
  if (!segments) return false;
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return false;
    const next = (current as Record<string, unknown>)[segments[i]];
    if (typeof next !== "object" || next === null || Array.isArray(next)) return false;
    current = next;
  }
  const parent = current as Record<string, unknown>;
  const leaf = segments[segments.length - 1];
  if (!(leaf in parent)) return false;
  delete parent[leaf];
  return true;
}

export function getRawByDotPath(root: unknown, path: string): DotPathResult {
  if (path === ROOT_PATH) {
    return typeof root === "object" && root !== null && !Array.isArray(root)
      ? { value: root, missing: false }
      : { value: undefined, missing: true };
  }
  const segments = splitDotPath(path);
  if (!segments) return { value: undefined, missing: true };
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return { value: undefined, missing: true };
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return { value: undefined, missing: true };
    current = record[segment];
  }
  return { value: current, missing: false };
}
