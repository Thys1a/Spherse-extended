function estimateString(input: string): number {
  if (input.length === 0) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) {
      other += 1;
      continue;
    }
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

export function estimateTokens(input: string): number {
  return estimateString(input);
}
