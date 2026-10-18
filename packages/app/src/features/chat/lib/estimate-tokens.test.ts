import { describe, expect, it } from "vitest";
import { estimateTokens as estimateTokensCore } from "@spherse/core";
import { estimateTokens } from "./estimate-tokens";

const CASES = [
  "",
  "hello world",
  "你好世界",
  "hello 你好 world 世界",
  "こんにちは",
  "안녕하세요",
  "a".repeat(1000),
  "混".repeat(500),
  "Hello, 世界! 123 🎉\nnewline\ttab",
  "x".repeat(997),
];

describe("estimateTokens mirror", () => {
  it.each(CASES)("matches core for %j", (input) => {
    expect(estimateTokens(input)).toBe(estimateTokensCore(input));
  });
});
