import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AccessPolicyProvider } from "../access/access-policy.js";
import { resolveProjectPath } from "../utils/path-safety.js";
import { isBinaryBuffer } from "../utils/binary-detect.js";
import { MAX_OUTPUT_CHARS, truncateText } from "./output-limits.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"]);

function isImageExt(filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ReadFileParams = Type.Object({
  path: Type.String({ description: "Path relative to project root" }),
  offset: Type.Optional(Type.Integer({
    description: "Start line (1-based). Defaults to 1.",
    minimum: 1,
    default: 1,
  })),
  limit: Type.Optional(Type.Integer({
    description: "Max lines to return. Defaults to the whole file (subject to the 32KB output cap).",
    minimum: 1,
  })),
});

export function createReadFileTool(
  projectRoot: string,
  getPolicy: AccessPolicyProvider,
): AgentTool<typeof ReadFileParams> {
  const root = path.resolve(projectRoot);

  return {
    name: "read_file",
    label: "Read File",
    description:
      "Read the content of a text file in the project. Returns the file content as text. Binary files (images, fonts, databases, etc.) are detected and refused with a hint instead of returning garbled output — use `render_card` with `file_path` to display image files. Output is capped at 32KB; use offset/limit to page through large files and check details.truncated.",
    parameters: ReadFileParams,
    async execute(_toolCallId, params, _signal) {
      const resolved = resolveProjectPath(root, params.path);
      try {
        getPolicy().assertRead(params.path);
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          details: { path: params.path, denied: true },
        };
      }

      let buf: Buffer;
      try {
        buf = await fs.readFile(resolved);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Error: file not found at ${params.path}` }],
          details: undefined,
        };
      }

      if (isBinaryBuffer(buf)) {
        const size = buf.length;
        const image = isImageExt(params.path);
        const hint = image
          ? `Error: \`${params.path}\` is a binary image file (${formatSize(size)}). \`read_file\` only returns text. To display this image, call \`render_card\` with \`file_path: "${params.path}"\`.`
          : `Error: \`${params.path}\` is a binary file (${formatSize(size)}). \`read_file\` only returns text and cannot read binary content.`;
        return {
          content: [{ type: "text" as const, text: hint }],
          details: { path: params.path, binary: true, image, size, totalLength: size, returnedLength: 0 },
        };
      }

      const content = buf.toString("utf-8");
      const lines = content.split("\n");
      const offset = Math.min(Math.max(params.offset ?? 1, 1), lines.length + 1);
      const windowed = params.limit === undefined
        ? lines.slice(offset - 1)
        : lines.slice(offset - 1, offset - 1 + params.limit);
      const { text, truncated } = truncateText(windowed.join("\n"), MAX_OUTPUT_CHARS);
      const sliced = params.limit !== undefined || offset !== 1;
      return {
        content: [{ type: "text" as const, text }],
        details: {
          path: params.path,
          size: content.length,
          totalLength: content.length,
          returnedLength: text.length,
          truncated: truncated || sliced,
          ...(params.offset !== undefined ? { offset: params.offset } : {}),
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
        },
      };
    },
  };
}
