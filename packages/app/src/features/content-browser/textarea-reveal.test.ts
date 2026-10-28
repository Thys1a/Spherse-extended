import { describe, expect, it } from "vitest";
import { toTextareaOffset } from "./textarea-reveal";

describe("toTextareaOffset", () => {
  it("is identity for text without CRLF", () => {
    expect(toTextareaOffset("abc\ndef", 5)).toBe(5);
    expect(toTextareaOffset("abc\ndef", 0)).toBe(0);
  });

  it("subtracts one per preceding CRLF pair", () => {
    const text = "a\r\nb\r\nc";
    expect(toTextareaOffset(text, 0)).toBe(0);
    expect(toTextareaOffset(text, 3)).toBe(2);
    expect(toTextareaOffset(text, 6)).toBe(4);
  });

  it("maps the LF position of a pair to the normalized LF position", () => {
    expect(toTextareaOffset("a\r\nb", 2)).toBe(1);
  });

  it("maps a trailing CRLF end offset to the normalized length", () => {
    expect(toTextareaOffset("a\r\n", 3)).toBe(2);
  });

  it("ignores lone carriage returns", () => {
    expect(toTextareaOffset("a\rb", 2)).toBe(2);
  });

  it("clamps out-of-range offsets", () => {
    expect(toTextareaOffset("a\r\nb", -5)).toBe(0);
    expect(toTextareaOffset("a\r\nb", 100)).toBe(3);
  });
});
