import path from "node:path";
import { resolveProjectPath } from "../../utils/path-safety.js";

const CARD_EXTENSION = ".card.json";

function hasSpherseSegment(normalized: string): boolean {
  return normalized
    .split("/")
    .some((segment) => segment.toLowerCase() === ".spherse");
}

export function resolveCardFile(projectRoot: string, file: string): string {
  if (typeof file !== "string" || !file) throw new Error("file must be a non-empty string");
  const normalized = file.replace(/\\/g, "/");
  if (!normalized.endsWith(CARD_EXTENSION)) {
    throw new Error(`card file must end with ${CARD_EXTENSION}: ${file}`);
  }
  if (hasSpherseSegment(normalized)) {
    throw new Error("card file must not live inside .spherse/");
  }
  const resolved = resolveProjectPath(path.resolve(projectRoot), normalized);
  const relative = path.relative(path.resolve(projectRoot), resolved).replace(/\\/g, "/");
  if (hasSpherseSegment(relative)) {
    throw new Error("card file must not live inside .spherse/");
  }
  return resolved;
}

export function toPosixRelative(projectRoot: string, absolutePath: string): string {
  return path.relative(path.resolve(projectRoot), absolutePath).replace(/\\/g, "/");
}
