import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  createTextAttachmentProcessor,
  DEFAULT_TEXT_ATTACHMENT_BUDGET,
} from "../../attachments/text-processor.js";
import { attachmentsCapability } from "../../capabilities/attachments/index.js";
import { AccessDeniedError, ValidationError } from "../../errors.js";

describe("text attachment processor", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-txt-att-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeAttachment(name: string, content: string | Buffer): string {
    const attachmentsDir = path.join(tmpDir, ".spherse", "attachments");
    fs.mkdirSync(attachmentsDir, { recursive: true });
    fs.writeFileSync(path.join(attachmentsDir, name), content);
    return `.spherse/attachments/${name}`;
  }

  function preprocess(relPath: string, maxChars?: number) {
    return createTextAttachmentProcessor(maxChars).preprocess({
      projectRoot: tmpDir,
      attachment: { type: "text", path: relPath, mimeType: "text/plain" },
    });
  }

  it("returns short files as a single text block", async () => {
    const rel = writeAttachment("note.txt", "hello world");
    const blocks = await preprocess(rel);
    expect(blocks).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("truncates long files at the budget with size metadata", async () => {
    const rel = writeAttachment("long.txt", "a".repeat(DEFAULT_TEXT_ATTACHMENT_BUDGET + 10));
    const blocks = await preprocess(rel);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    const text = (blocks[0] as { text: string }).text;
    expect(text.startsWith("a".repeat(DEFAULT_TEXT_ATTACHMENT_BUDGET))).toBe(true);
    expect(text).toContain("truncated");
    expect(text).toContain(String(DEFAULT_TEXT_ATTACHMENT_BUDGET + 10));
  });

  it("honours a custom budget", async () => {
    const rel = writeAttachment("custom.txt", "abcdefghij");
    const blocks = await preprocess(rel, 4);
    expect(blocks).toEqual([
      { type: "text", text: expect.stringContaining("abcd") },
    ]);
  });

  it("rejects binary content", async () => {
    const rel = writeAttachment("bin.dat", Buffer.from([0x00, 0x01, 0x02]));
    await expect(preprocess(rel)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws when path is outside .spherse/attachments", async () => {
    fs.writeFileSync(path.join(tmpDir, "evil.txt"), "x");
    await expect(preprocess("evil.txt")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("is contributed by the attachments capability under the 'text' type", () => {
    const processors = attachmentsCapability().attachmentProcessors ?? [];
    expect(processors.find((p) => p.type === "text")).toBeDefined();
  });
});
