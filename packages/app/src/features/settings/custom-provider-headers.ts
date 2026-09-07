const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_VALUE_LENGTH = 1024;

export const MAX_HEADER_COUNT = 20;

export function isValidHeaderName(name: string): boolean {
  return HEADER_NAME_RE.test(name);
}

export function isValidHeaderValue(value: string): boolean {
  return !/[\r\n]/.test(value) && value.length <= MAX_VALUE_LENGTH;
}

export interface HeaderRow {
  name: string;
  value: string;
}

export function recordToHeaderRows(record?: Record<string, string>): HeaderRow[] {
  return Object.entries(record ?? {}).map(([name, value]) => ({ name, value }));
}

export function headersToRecord(rows: HeaderRow[]): Record<string, string> | undefined {
  const filtered = rows.filter((row) => row.name.trim() !== "");
  if (filtered.length === 0) return undefined;
  const record: Record<string, string> = {};
  for (const row of filtered) record[row.name.trim()] = row.value;
  return record;
}