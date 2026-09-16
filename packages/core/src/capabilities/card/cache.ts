import type { ParsedCard } from "./parser.js";

export class CardCache {
  private readonly map = new Map<string, { bytes: number; card: ParsedCard }>();
  private usedBytes = 0;
  constructor(private readonly maxBytes = 32 * 1024 * 1024) {}

  private key(absolutePath: string, contentHash: string): string {
    return `${absolutePath}\0${contentHash}`;
  }

  get(absolutePath: string, contentHash: string): ParsedCard | undefined {
    const key = this.key(absolutePath, contentHash);
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value?.card;
  }

  set(absolutePath: string, contentHash: string, card: ParsedCard): void {
    const key = this.key(absolutePath, contentHash);
    const existing = this.map.get(key);
    if (existing) {
      this.usedBytes -= existing.bytes;
      this.map.delete(key);
    }
    this.map.set(key, { bytes: card.bytes, card });
    this.usedBytes += card.bytes;
    while (this.usedBytes > this.maxBytes && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const removed = this.map.get(oldest);
      if (removed) this.usedBytes -= removed.bytes;
      this.map.delete(oldest);
    }
  }

  invalidateFile(absolutePath: string): void {
    const prefix = `${absolutePath}\0`;
    for (const [key, value] of this.map) {
      if (key.startsWith(prefix)) {
        this.usedBytes -= value.bytes;
        this.map.delete(key);
      }
    }
  }
}
