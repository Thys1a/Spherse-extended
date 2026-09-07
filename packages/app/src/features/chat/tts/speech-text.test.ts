import { describe, expect, it } from "vitest";
import { extractSpeechText, splitSentences } from "./speech-text";

describe("extractSpeechText", () => {
  it("replaces code fences with a placeholder", () => {
    expect(extractSpeechText("前文\n```js\nconst a = 1;\n```\n后文")).toBe(
      "前文\n（代码块）\n后文",
    );
  });

  it("keeps inline code text", () => {
    expect(extractSpeechText("运行 `npm install` 即可")).toBe("运行 npm install 即可");
  });

  it("uses link anchor text", () => {
    expect(extractSpeechText("参见[文档](https://example.com)")).toBe("参见文档");
  });

  it("strips headings", () => {
    expect(extractSpeechText("# 标题\n正文")).toBe("标题\n正文");
  });

  it("strips emphasis markers", () => {
    expect(extractSpeechText("这是**重点**和*斜体*")).toBe("这是重点和斜体");
  });

  it("strips images to alt text", () => {
    expect(extractSpeechText("![图片说明](x.png)")).toBe("图片说明");
  });

  it("strips blockquote and list markers", () => {
    expect(extractSpeechText("> 引用\n- 项目一\n- 项目二")).toBe("引用\n项目一\n项目二");
  });
});

describe("splitSentences", () => {
  it("merges short sentences up to maxLen", () => {
    expect(splitSentences("第一句。第二句！\n第三句？")).toEqual([
      "第一句。 第二句！ 第三句？",
    ]);
  });

  it("splits at sentence boundaries when total exceeds maxLen", () => {
    expect(splitSentences("一二三。四五六。七八九。", 9)).toEqual([
      "一二三。 四五六。",
      "七八九。",
    ]);
  });

  it("hard-splits a part longer than maxLen", () => {
    const long = "字".repeat(500);
    const parts = splitSentences(long, 200);
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(splitSentences("")).toEqual([]);
  });
});
