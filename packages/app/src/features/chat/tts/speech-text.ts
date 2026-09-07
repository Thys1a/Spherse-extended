const CODE_FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`([^`]+)`/g;
const IMAGE_LINK = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING = /^\s{0,3}#{1,6}\s+/gm;
const EMPHASIS = /(\*\*|__)(.*?)\1/g;
const EMPHASIS_LIGHT = /(?<!\*)(\*|_)(.*?)\1(?!\*)/g;
const STRIKE = /~~(.*?)~~/g;
const BLOCKQUOTE = /^\s*>\s?/gm;
const LIST_DASH = /^\s*[-*+]\s+/gm;
const LIST_NUM = /^\s*\d+\.\s+/gm;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/gm;

export function extractSpeechText(markdown: string): string {
  return markdown
    .replace(CODE_FENCE, "（代码块）")
    .replace(INLINE_CODE, "$1")
    .replace(IMAGE_LINK, "$1")
    .replace(LINK, "$1")
    .replace(HEADING, "")
    .replace(EMPHASIS, "$2")
    .replace(EMPHASIS_LIGHT, "$2")
    .replace(STRIKE, "$1")
    .replace(BLOCKQUOTE, "")
    .replace(LIST_DASH, "")
    .replace(LIST_NUM, "")
    .replace(HR, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SENTENCE_END = /[。！？.!?]/;

function splitByBoundaries(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of text) {
    current += ch;
    if (SENTENCE_END.test(ch) || ch === "\n") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function splitSentences(text: string, maxLen = 200): string[] {
  const sentences: string[] = [];
  let current = "";
  for (const part of splitByBoundaries(text)) {
    if ((current + " " + part).trim().length <= maxLen) {
      current = (current + " " + part).trim();
      continue;
    }
    if (current) sentences.push(current);
    if (part.length > maxLen) {
      for (let i = 0; i < part.length; i += maxLen) {
        sentences.push(part.slice(i, i + maxLen));
      }
      current = "";
    } else {
      current = part;
    }
  }
  if (current) sentences.push(current);
  return sentences;
}
