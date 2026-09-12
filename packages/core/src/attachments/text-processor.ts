import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath, isPathInside } from "../utils/path-safety.js";
import { AccessDeniedError, ValidationError } from "../errors.js";
import { PROJECT_META_DIR } from "../types.js";
import type { AttachmentProcessor } from "./index.js";

const ATTACHMENTS_DIR = path.join(PROJECT_META_DIR, "attachments");

export const DEFAULT_TEXT_ATTACHMENT_BUDGET = 16 * 1024;

function decodeText(buf: Buffer, attachmentPath: string): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8", 3);
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le", 2);
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buf.includes(0)) {
    throw new ValidationError(`Attachment is not a text file: ${attachmentPath}`);
  }
  return buf.toString("utf8");
}

function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) {
    end = Math.floor((end * maxBytes) / Buffer.byteLength(text.slice(0, end), "utf8"));
  }
  return text.slice(0, end);
}

export function createTextAttachmentProcessor(
  maxBytes: number = DEFAULT_TEXT_ATTACHMENT_BUDGET,
): AttachmentProcessor {
  return {
    type: "text",
    async preprocess({ projectRoot, attachment }) {
      const root = path.resolve(projectRoot);
      const attachmentsRoot = path.resolve(root, ATTACHMENTS_DIR);
      const resolved = resolveProjectPath(root, attachment.path);
      if (!isPathInside(attachmentsRoot, resolved)) {
        throw new AccessDeniedError(
          `Attachment path must be inside ${ATTACHMENTS_DIR}/: ${attachment.path}`,
        );
      }
      const buf = await fs.readFile(resolved);
      const text = decodeText(buf, attachment.path);
      if (Buffer.byteLength(text, "utf8") <= maxBytes) return [{ type: "text", text }];
      return [
        {
          type: "text",
          text: `${truncateToBytes(text, maxBytes)}\n…[truncated ${buf.byteLength} bytes, showing first ${maxBytes} bytes]`,
        },
      ];
    },
  };
}
