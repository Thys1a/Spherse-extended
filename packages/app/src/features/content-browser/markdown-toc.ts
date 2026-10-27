import { splitFrontmatter } from "./frontmatter";

export interface EditTocEntry {
  text: string;
  level: number;
  offset: number;
}

const ATX_RE = /^ {0,3}(#{1,6})(?:\s|$)/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/;
const BLOCKQUOTE_RE = /^ {0,3}>/;
const LIST_ITEM_RE = /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:\s|$)/;
const THEMATIC_RE = /^ {0,3}(?:\*(?:[ \t]*\*){2,}|-(?:[ \t]*-){2,}|_(?:[ \t]*_){2,})[ \t]*$/;
const TAG_LINE_RE = /^ {0,3}<[A-Za-z!?/]/;

export function parseMarkdownToc(text: string): EditTocEntry[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const { blockLength } = splitFrontmatter(normalized);
  const entries: EditTocEntry[] = [];
  const rawLines = normalized.slice(blockLength).split("\n");
  let index = blockLength;
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;
  let inHtmlComment = false;
  let prevLine = "";
  let prevLineOffset = -1;
  for (const raw of rawLines) {
    const lineStart = index;
    index += raw.length + 1;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (inHtmlComment) {
      if (line.includes("-->")) inHtmlComment = false;
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    const fence = line.match(FENCE_RE);
    if (fence) {
      const seq = fence[1];
      if (fenceChar === null) {
        fenceChar = seq[0] as "`" | "~";
        fenceLen = seq.length;
      } else if (seq[0] === fenceChar && seq.length >= fenceLen && fence[2].trim() === "") {
        fenceChar = null;
        fenceLen = 0;
      }
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    if (fenceChar !== null || BLOCKQUOTE_RE.test(line)) {
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    const commentStart = line.indexOf("<!--");
    if (commentStart !== -1 && !line.slice(commentStart).includes("-->")) {
      inHtmlComment = true;
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    if (line.trim() === "") {
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    const setext = line.match(SETEXT_RE);
    if (setext && prevLineOffset >= 0) {
      entries.push({
        text: prevLine.trim(),
        level: setext[1][0] === "=" ? 1 : 2,
        offset: prevLineOffset,
      });
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    const atx = line.match(ATX_RE);
    if (atx) {
      const level = atx[1].length;
      if (level <= 3) {
        const entryText = line
          .slice(atx[0].length)
          .replace(/(?:^| )#+ *$/, "")
          .trim();
        if (entryText !== "") {
          entries.push({ text: entryText, level, offset: lineStart });
        }
      }
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    if (
      LIST_ITEM_RE.test(line) ||
      line.startsWith("    ") ||
      line.startsWith("\t") ||
      THEMATIC_RE.test(line) ||
      TAG_LINE_RE.test(line) ||
      line.includes("<!--")
    ) {
      prevLine = "";
      prevLineOffset = -1;
      continue;
    }
    prevLine = line;
    prevLineOffset = lineStart;
  }
  return entries;
}
