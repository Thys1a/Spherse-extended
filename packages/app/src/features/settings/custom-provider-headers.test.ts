import { describe, expect, it } from "vitest";
import {
  headersToRecord,
  isValidHeaderName,
  isValidHeaderValue,
  MAX_HEADER_COUNT,
  recordToHeaderRows,
} from "./custom-provider-headers";

describe("isValidHeaderName", () => {
  it("accepts RFC 7230 token characters", () => {
    expect(isValidHeaderName("X-Custom-Auth")).toBe(true);
    expect(isValidHeaderName("User-Agent")).toBe(true);
    expect(isValidHeaderName("x!@$%^&*")).toBe(false);
  });

  it("rejects spaces and delimiters", () => {
    expect(isValidHeaderName("Bad Header")).toBe(false);
    expect(isValidHeaderName("Bad:Header")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidHeaderName("")).toBe(false);
  });
});

describe("isValidHeaderValue", () => {
  it("accepts a normal value", () => {
    expect(isValidHeaderValue("Bearer abc")).toBe(true);
  });

  it("rejects newlines", () => {
    expect(isValidHeaderValue("a\nb")).toBe(false);
    expect(isValidHeaderValue("a\rb")).toBe(false);
  });

  it("rejects values longer than 1KB", () => {
    expect(isValidHeaderValue("x".repeat(1025))).toBe(false);
  });
});

describe("headersToRecord / recordToHeaderRows", () => {
  it("round-trips a record through rows", () => {
    const rows = recordToHeaderRows({ "X-A": "1", "X-B": "2" });
    expect(rows).toEqual([
      { name: "X-A", value: "1" },
      { name: "X-B", value: "2" },
    ]);
    expect(headersToRecord(rows)).toEqual({ "X-A": "1", "X-B": "2" });
  });

  it("returns undefined when all rows are empty", () => {
    expect(headersToRecord([{ name: "", value: "" }])).toBeUndefined();
  });

  it("drops rows with empty names and dedupes by name", () => {
    expect(
      headersToRecord([
        { name: "", value: "ignored" },
        { name: "X-A", value: "1" },
        { name: "X-A", value: "2" },
      ]),
    ).toEqual({ "X-A": "2" });
  });
});

describe("MAX_HEADER_COUNT", () => {
  it("caps at 20", () => {
    expect(MAX_HEADER_COUNT).toBe(20);
  });
});