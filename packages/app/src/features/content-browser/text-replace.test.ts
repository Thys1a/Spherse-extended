import { describe, expect, it } from "vitest";
import { countMatches, replaceAllOccurrences, replaceOneAt } from "./text-replace";

describe("replaceOneAt", () => {
  it("splices the replacement into the range", () => {
    expect(replaceOneAt("hello world", 6, 11, "there")).toBe("hello there");
  });
});

describe("replaceAllOccurrences", () => {
  it("replaces every non-overlapping match and reports the count", () => {
    expect(replaceAllOccurrences("aaa", "a", "b")).toEqual({ nextText: "bbb", replacedCount: 3 });
  });

  it("matches case-insensitively", () => {
    expect(replaceAllOccurrences("Foo foo FOO", "foo", "bar")).toEqual({
      nextText: "bar bar bar",
      replacedCount: 3,
    });
  });

  it("supports empty replacement as deletion", () => {
    expect(replaceAllOccurrences("a-b-c", "-", "")).toEqual({ nextText: "abc", replacedCount: 2 });
  });

  it("returns the text unchanged for empty needle or no match", () => {
    expect(replaceAllOccurrences("abc", "", "x")).toEqual({ nextText: "abc", replacedCount: 0 });
    expect(replaceAllOccurrences("abc", "z", "x")).toEqual({ nextText: "abc", replacedCount: 0 });
  });

  it("handles replacements longer than the needle", () => {
    expect(replaceAllOccurrences("ab ab", "ab", "abcd")).toEqual({
      nextText: "abcd abcd",
      replacedCount: 2,
    });
  });
});

describe("countMatches", () => {
  it("counts case-insensitive matches", () => {
    expect(countMatches("Foo foo", "foo")).toBe(2);
    expect(countMatches("abc", "")).toBe(0);
  });
});
