import { describe, expect, it } from "vitest";
import { parseMarkdownToc } from "./markdown-toc";

describe("parseMarkdownToc", () => {
  it("collects ATX headings level 1-3 with line-start offsets", () => {
    const text = "# Title\n\nbody\n\n## Section\n\n### Sub\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Title", level: 1, offset: 0 },
      { text: "Section", level: 2, offset: text.indexOf("## Section") },
      { text: "Sub", level: 3, offset: text.indexOf("### Sub") },
    ]);
  });

  it("ignores level 4+ headings", () => {
    const text = "# A\n#### Deep\n##### Deeper\n###### Deepest\n";
    expect(parseMarkdownToc(text)).toEqual([{ text: "A", level: 1, offset: 0 }]);
  });

  it("strips closing sequences but keeps hashes without a preceding space", () => {
    const text = "# foo #\n# bar#\n# ###\n#\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "foo", level: 1, offset: 0 },
      { text: "bar#", level: 1, offset: text.indexOf("# bar#") },
    ]);
  });

  it("collects setext levels 1 and 2 from the previous line", () => {
    const text = "Big\n===\n\nSmall\n---\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Big", level: 1, offset: 0 },
      { text: "Small", level: 2, offset: text.indexOf("Small") },
    ]);
  });

  it("does not treat dashes as setext without a preceding paragraph line", () => {
    expect(parseMarkdownToc("---\n\n# Title\n")).toEqual([
      { text: "Title", level: 1, offset: 5 },
    ]);
  });

  it("does not treat list items, indented code, or html as setext paragraphs", () => {
    expect(parseMarkdownToc("- one\n- two\n---\n")).toEqual([]);
    expect(parseMarkdownToc("    code\n---\n")).toEqual([]);
    expect(parseMarkdownToc("<!-- x -->\n---\n")).toEqual([]);
    expect(parseMarkdownToc("***\n===\n")).toEqual([]);
    expect(parseMarkdownToc("- item\n===\n")).toEqual([]);
    expect(parseMarkdownToc("-\n===\n")).toEqual([]);
  });

  it("takes only the last line of a multi-line setext paragraph", () => {
    const text = "foo\nbar\n===\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "bar", level: 1, offset: text.indexOf("bar") },
    ]);
  });

  it("skips headings inside fenced code blocks", () => {
    const text = "# Real\n\n```js\n# Fake\n```\n\n~~~\n## Also fake\n~~~\n";
    expect(parseMarkdownToc(text)).toEqual([{ text: "Real", level: 1, offset: 0 }]);
  });

  it("keeps long fences open across short fence runs", () => {
    const text = "````\n```\n# Still fenced\n````\n\n# Real\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Real", level: 1, offset: text.indexOf("# Real") },
    ]);
  });

  it("skips headings inside frontmatter and keeps full-text offsets", () => {
    const text = "---\ntitle: Hi\n# not a heading: x\n---\n\n# Real\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Real", level: 1, offset: text.indexOf("# Real") },
    ]);
  });

  it("treats broken frontmatter as content like the reading view", () => {
    const text = "---\ntitle: : bad\n  : x\n---\n\n# Real\n";
    const entries = parseMarkdownToc(text);
    expect(entries.map((e) => e.text)).toContain("Real");
    expect(entries.find((e) => e.text === "Real")?.offset).toBe(text.indexOf("# Real"));
  });

  it("requires a space after the hashes and allows up to 3 leading spaces", () => {
    const text = "#nospace\n   # Indented\n    # Code\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Indented", level: 1, offset: "#nospace\n".length },
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = "# Title\r\n\r\n## Sub\r\n";
    const normalized = "# Title\n\n## Sub\n";
    expect(parseMarkdownToc(text)).toEqual([
      { text: "Title", level: 1, offset: 0 },
      { text: "Sub", level: 2, offset: normalized.indexOf("## Sub") },
    ]);
  });

  it("skips headings in blockquotes, lists, and HTML comments", () => {
    const text = "# Real\n\n> # Quoted\n\n- # Listed\n\n<!--\n# Commented\n-->\n";
    expect(parseMarkdownToc(text)).toEqual([{ text: "Real", level: 1, offset: 0 }]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseMarkdownToc("")).toEqual([]);
  });
});
