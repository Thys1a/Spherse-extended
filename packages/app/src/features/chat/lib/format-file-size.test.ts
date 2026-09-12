import { describe, expect, it } from "vitest";
import { formatFileSize } from "./format-file-size";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes with one decimal below 100", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(48 * 1024)).toBe("48 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("guards non-finite input", () => {
    expect(formatFileSize(Number.NaN)).toBe("0 B");
    expect(formatFileSize(-5)).toBe("0 B");
  });
});
