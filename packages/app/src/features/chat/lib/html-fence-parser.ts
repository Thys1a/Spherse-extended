export interface HtmlFenceBlock {
  source: string;
  start: number;
  end: number;
}

export function extractHtmlFenceBlocks(content: string): HtmlFenceBlock[] {
  const blocks: HtmlFenceBlock[] = [];
  const lines = content.split("\n");
  let offset = 0;
  let openStart = -1;
  let sourceStart = -1;
  const closeOpen = (end: number) => {
    blocks.push({ source: lines.slice(sourceStart, end).join("\n"), start: openStart, end: offset });
    openStart = -1;
    sourceStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    const trimmed = line.trim();
    if (openStart === -1) {
      if (/^```html$/i.test(trimmed)) {
        openStart = lineStart;
        sourceStart = i + 1;
      }
      continue;
    }
    if (trimmed === "```") {
      closeOpen(i);
    }
  }

  if (openStart !== -1) {
    blocks.push({
      source: lines.slice(sourceStart).join("\n"),
      start: openStart,
      end: content.length,
    });
  }
  return blocks;
}

export function stripHtmlFences(content: string): string {
  const blocks = extractHtmlFenceBlocks(content);
  if (blocks.length === 0) return content;
  let out = "";
  let cursor = 0;
  for (const block of blocks) {
    out += content.slice(cursor, block.start);
    cursor = block.end;
  }
  out += content.slice(cursor);
  return out.replace(/\n{3,}/g, "\n\n");
}

