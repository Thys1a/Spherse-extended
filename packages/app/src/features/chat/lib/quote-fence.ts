export function quoteFenceFor(text: string): string {
  let length = 3;
  while (text.includes("`".repeat(length))) length++;
  return "`".repeat(length);
}
