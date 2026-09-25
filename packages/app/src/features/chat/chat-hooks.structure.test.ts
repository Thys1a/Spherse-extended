import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

function sourceOf(file: string): string {
  return readFileSync(join(currentDir, file), "utf8");
}

describe("chat theme hooks (R4.1)", () => {
  it("MessageList exposes a welcome hook for the empty state", () => {
    expect(sourceOf("MessageList.tsx")).toContain("data-chat-welcome");
  });

  it("ToolItemView exposes a tool-call row hook", () => {
    expect(sourceOf("ToolItemView.tsx")).toContain("data-chat-tool-call");
  });

  it("HtmlCard exposes an html-card container hook", () => {
    expect(sourceOf("HtmlCard.tsx")).toContain("data-chat-html-card");
  });
});
