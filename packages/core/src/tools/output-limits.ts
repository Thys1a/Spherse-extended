export const MAX_LINE_CHARS = 500;
export const MAX_OUTPUT_CHARS = 32 * 1024;

export function truncateLine(raw: string): { text: string; truncated: boolean } {
  if (raw.length <= MAX_LINE_CHARS) return { text: raw, truncated: false };
  return {
    text: `${raw.slice(0, MAX_LINE_CHARS)} …(该行共 ${raw.length} 字符，已截断)`,
    truncated: true,
  };
}

export function outputLimitNotice(): string {
  return `…（已达输出上限 ${MAX_OUTPUT_CHARS / 1024} KB，结果被截断，请缩小关键词或指定 path）`;
}
