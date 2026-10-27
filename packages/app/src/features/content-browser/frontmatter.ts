import yaml from "js-yaml";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function splitFrontmatter(raw: string): {
  blockLength: number;
  frontmatter: Record<string, unknown> | null;
} {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { blockLength: 0, frontmatter: null };
  let parsed: unknown;
  try {
    parsed = yaml.load(match[1]);
  } catch {
    return { blockLength: 0, frontmatter: null };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { blockLength: 0, frontmatter: null };
  }
  return { blockLength: match[0].length, frontmatter: parsed as Record<string, unknown> };
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const { blockLength, frontmatter } = splitFrontmatter(raw);
  if (!frontmatter) return { frontmatter: null, body: raw };
  return {
    frontmatter,
    body: raw.slice(blockLength).replace(/^[\r\n]+/, ""),
  };
}
