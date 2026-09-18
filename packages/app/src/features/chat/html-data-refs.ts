const DATA_REF_PATTERN = /["'`]([^"'`\s]*\.data\.json)["'`]/g;
const MAX_DATA_REFS = 32;

function normalizeDataRef(raw: string): string | null {
  let value = raw.trim().replace(/\\/g, "/");
  if (!value) return null;
  if (
    value.startsWith("/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    /^[a-zA-Z]:\//.test(value)
  ) {
    return null;
  }
  if (value.startsWith("./")) value = value.slice(2);
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

export function extractDataFileRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const match of html.matchAll(DATA_REF_PATTERN)) {
    const normalized = normalizeDataRef(match[1]);
    if (normalized) refs.add(normalized);
    if (refs.size >= MAX_DATA_REFS) break;
  }
  return [...refs];
}
