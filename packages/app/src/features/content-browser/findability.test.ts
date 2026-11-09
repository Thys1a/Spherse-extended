import { describe, expect, it } from "vitest";
import { isFindable, type FindableInput } from "./findability";

function base(overrides: Partial<FindableInput> = {}): FindableInput {
  return {
    loading: false,
    error: null,
    binary: false,
    isImage: false,
    isHtml: true,
    htmlView: "preview",
    isEditing: false,
    ...overrides,
  };
}

describe("isFindable", () => {
  it("hides find for html preview outside editing", () => {
    expect(isFindable(base())).toBe(false);
  });

  it("shows find when editing from html preview", () => {
    expect(isFindable(base({ isEditing: true }))).toBe(true);
  });

  it("shows find for html source with or without editing", () => {
    expect(isFindable(base({ htmlView: "source" }))).toBe(true);
    expect(isFindable(base({ htmlView: "source", isEditing: true }))).toBe(true);
  });

  it("shows find for non-html files with or without editing", () => {
    expect(isFindable(base({ isHtml: false }))).toBe(true);
    expect(isFindable(base({ isHtml: false, isEditing: true }))).toBe(true);
  });

  it("hides find while loading, on error, or for binary/image", () => {
    for (const overrides of [
      { loading: true },
      { error: "boom" },
      { binary: true },
      { isImage: true },
    ] as const) {
      expect(isFindable(base({ ...overrides }))).toBe(false);
      expect(isFindable(base({ ...overrides, isEditing: true }))).toBe(false);
    }
  });
});
