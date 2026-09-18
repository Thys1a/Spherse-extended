import { describe, expect, it } from "vitest";
import { extractDataFileRefs } from "./html-data-refs";

describe("extractDataFileRefs", () => {
  it("finds quoted .data.json references", () => {
    const html = `<script>entries({file:"forum.data.json"});fetch('stats.data.json')</script>`;
    expect(extractDataFileRefs(html)).toEqual(["forum.data.json", "stats.data.json"]);
  });

  it("dedupes and normalizes ./ prefixes", () => {
    const html = `"a.data.json" './a.data.json' "a.data.json"`;
    expect(extractDataFileRefs(html)).toEqual(["a.data.json"]);
  });

  it("rejects absolute urls and path escapes", () => {
    const html = `"/abs.data.json" "https://x/y.data.json" "../evil.data.json" "C:/w.data.json"`;
    expect(extractDataFileRefs(html)).toEqual([]);
  });

  it("ignores non-data files and empty input", () => {
    expect(extractDataFileRefs(`"app.json" "notes.txt" "<p>hi</p>"`)).toEqual([]);
    expect(extractDataFileRefs("")).toEqual([]);
  });

  it("bounds the subscription set", () => {
    const html = Array.from({ length: 40 }, (_, i) => `"f${i}.data.json"`).join(" ");
    expect(extractDataFileRefs(html)).toHaveLength(32);
  });
});
