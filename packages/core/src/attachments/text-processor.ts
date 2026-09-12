import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath, isPathInside } from "../utils/path-safety.js";
import { AccessDeniedError, ValidationError } from "../errors.js";
import { PROJECT_META_DIR } from "../types.js";
import type { AttachmentProcessor } from "./index.js";

const ATTACHMENTS_DIR = path.join(PROJECT_META_DIR, "attachments");

export const DEFAULT_TEXT_ATTACHMENT_BUDGET = 16 * 1024;

export function createTextAttachmentProcessor(
  maxChars: number = DEFAULT_TEXT_ATTACHMENT_BUDGET,
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
      if (buf.includes(0)) {
        throw new ValidationError(`Attachment is not a text file: ${attachment.path}`);
      }
      const text = buf.toString("utf8");
      if (text.length <= maxChars) return [{ type: "text", text }];
      return [
        {
          type: "text",
          text: `${text.slice(0, maxChars)}\n…[truncated ${buf.byteLength} bytes, showing first ${maxChars} chars]`,
        },
      ];
    },
  };
}
