import { findMatches } from "./hooks/find-engine";

export function replaceOneAt(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

export function replaceAllOccurrences(
  text: string,
  needle: string,
  replacement: string,
): { nextText: string; replacedCount: number } {
  if (!needle) return { nextText: text, replacedCount: 0 };
  const lower = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const starts: number[] = [];
  let from = 0;
  for (;;) {
    const idx = lower.indexOf(lowerNeedle, from);
    if (idx === -1) break;
    starts.push(idx);
    from = idx + lowerNeedle.length;
  }
  let nextText = text;
  for (let i = starts.length - 1; i >= 0; i--) {
    const s = starts[i];
    nextText = nextText.slice(0, s) + replacement + nextText.slice(s + needle.length);
  }
  return { nextText, replacedCount: starts.length };
}

export function countMatches(text: string, needle: string): number {
  return findMatches(text, needle).matches.length;
}
