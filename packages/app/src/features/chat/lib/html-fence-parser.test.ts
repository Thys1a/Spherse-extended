import { describe, expect, it } from "vitest";
import { extractHtmlFenceBlocks, stripHtmlFences } from "./html-fence-parser";

describe("extractHtmlFenceBlocks", () => {
  it("returns no blocks without html fences", () => {
    expect(extractHtmlFenceBlocks("hello **world**")).toEqual([]);
    expect(extractHtmlFenceBlocks("```js\nconst x = 1;\n```")).toEqual([]);
  });

  it("extracts a single block with source and ordered positions", () => {
    const content = ["before", "```html", "<h1>hi</h1>", "```", "after"].join("\n");
    const blocks = extractHtmlFenceBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("<h1>hi</h1>");
    expect(blocks[0].start).toBeLessThan(blocks[0].end);
    expect(content.slice(blocks[0].start, blocks[0].end)).toContain("<h1>hi</h1>");
  });

  it("extracts multiple blocks in order", () => {
    const content = [
      "```html",
      "<p>a</p>",
      "```",
      "between",
      "```html",
      "<p>b</p>",
      "```",
    ].join("\n");
    const blocks = extractHtmlFenceBlocks(content);
    expect(blocks.map((b) => b.source)).toEqual(["<p>a</p>", "<p>b</p>"]);
    expect(blocks[0].end).toBeLessThanOrEqual(blocks[1].start);
  });

  it("matches the language tag case-insensitively", () => {
    const blocks = extractHtmlFenceBlocks("```HTML\n<p>x</p>\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("<p>x</p>");
  });

  it("accepts indented fences", () => {
    const blocks = extractHtmlFenceBlocks(["- item", "  ```html", "  <p>x</p>", "  ```"].join("\n"));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("  <p>x</p>");
  });

  it("strips carriage returns from source on CRLF content", () => {
    const content = "a\r\n```html\r\n<p>x</p>\r\n```\r\nb";
    const blocks = extractHtmlFenceBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("<p>x</p>");
    expect(content.slice(blocks[0].start, blocks[0].end)).toContain("```html");
    expect(stripHtmlFences(content)).not.toContain("```");
    expect(stripHtmlFences(content)).not.toMatch(/(?:\r?\n){3,}/);
  });

  it("clamps the end offset when the closing fence ends the content", () => {
    const content = "```html\n<p>x</p>\n```";
    const blocks = extractHtmlFenceBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].end).toBe(content.length);
  });

  it("ignores four-backtick fences", () => {
    const content = "````html\n<p>x</p>\n````";
    expect(extractHtmlFenceBlocks(content)).toEqual([]);
    expect(stripHtmlFences(content)).toBe(content);
  });

  it("closes an unclosed fence at end of content", () => {
    const content = ["text", "```html", "<p>open"].join("\n");
    const blocks = extractHtmlFenceBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("<p>open");
    expect(blocks[0].end).toBe(content.length);
  });
});

describe("stripHtmlFences", () => {
  it("returns content unchanged without html fences", () => {
    expect(stripHtmlFences("just text")).toBe("just text");
  });

  it("removes fence blocks but keeps prose", () => {
    const stripped = stripHtmlFences(["look:", "```html", "<p>x</p>", "```", "done"].join("\n"));
    expect(stripped).not.toContain("```");
    expect(stripped).not.toContain("<p>x</p>");
    expect(stripped).toContain("look:");
    expect(stripped).toContain("done");
  });

  it("collapses leftover blank lines", () => {
    const stripped = stripHtmlFences(["a", "", "```html", "<p>x</p>", "```", "", "b"].join("\n"));
    expect(stripped).not.toMatch(/\n{3,}/);
  });
});

