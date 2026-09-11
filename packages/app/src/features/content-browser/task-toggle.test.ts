import { describe, expect, it } from "vitest";
import { toggleTaskAt, toggleTaskInContent } from "./task-toggle";

describe("toggleTaskAt", () => {
  it("checks an unchecked task", () => {
    expect(toggleTaskAt("- [ ] todo", 0, true)).toEqual({ nextBody: "- [x] todo", changed: true });
  });

  it("unchecks a checked task", () => {
    expect(toggleTaskAt("- [x] done", 0, false)).toEqual({ nextBody: "- [ ] done", changed: true });
  });

  it("normalizes uppercase X when unchecking", () => {
    expect(toggleTaskAt("- [X] done", 0, false)).toEqual({ nextBody: "- [ ] done", changed: true });
  });

  it("maps nested, quoted and ordered tasks in document order", () => {
    const body = "- [ ] a\n  - [ ] b\n> - [ ] c\n1. [x] d";
    expect(toggleTaskAt(body, 2, true).nextBody).toBe("- [ ] a\n  - [ ] b\n> - [x] c\n1. [x] d");
    expect(toggleTaskAt(body, 3, false).nextBody).toBe("- [ ] a\n  - [ ] b\n> - [ ] c\n1. [ ] d");
  });

  it("skips task-like lines inside fenced code blocks", () => {
    const body = "```\n- [ ] code\n```\n- [ ] real";
    expect(toggleTaskAt(body, 0, true)).toEqual({
      nextBody: "```\n- [ ] code\n```\n- [x] real",
      changed: true,
    });
  });

  it("reports unchanged for out-of-range index", () => {
    expect(toggleTaskAt("- [ ] a", 5, true)).toEqual({ nextBody: "- [ ] a", changed: false });
  });
});

describe("toggleTaskInContent", () => {
  it("preserves the frontmatter prefix", () => {
    const content = "---\ntitle: t\n---\n\n- [ ] todo";
    expect(toggleTaskInContent(content, 0, true)).toEqual({
      nextContent: "---\ntitle: t\n---\n\n- [x] todo",
      changed: true,
    });
  });

  it("works without frontmatter", () => {
    expect(toggleTaskInContent("- [ ] a", 0, true).nextContent).toBe("- [x] a");
  });
});
