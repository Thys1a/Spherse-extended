import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ProjectRegistry } from "../registry.js";
import {
  resolveProjectPath,
  assertInsideProject,
  isPathInside,
  serverAccessPolicy,
  AccessDeniedError,
} from "@spherse/core";
import { badRequest, forbidden, notFound } from "../errors.js";

const ATTACHMENTS_DIR = ".spherse/attachments";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
};

const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function maxBytesFor(mimeType: string): number {
  return mimeType.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
}

export function registerAttachmentsRoutes(
  fastify: FastifyInstance,
  _registry: ProjectRegistry,
): void {
  fastify.post<{
    Params: { projectId: string };
  }>("/api/projects/:projectId/attachments", async (req) => {
    let fileBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let filename: string | undefined;
    let width: number | undefined;
    let height: number | undefined;

    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "file") continue;
          mimeType = part.mimetype;
          filename = part.filename;
          fileBuffer = await part.toBuffer();
        } else if (part.fieldname === "width") {
          const n = Number(part.value);
          if (Number.isFinite(n)) width = n;
        } else if (part.fieldname === "height") {
          const n = Number(part.value);
          if (Number.isFinite(n)) height = n;
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE"
      ) {
        throw badRequest("File too large");
      }
      throw err;
    }

    if (!fileBuffer || !mimeType) {
      throw badRequest("Missing file");
    }
    if (!(mimeType in MIME_TO_EXT)) {
      throw badRequest("Unsupported media type");
    }
    if (fileBuffer.byteLength > maxBytesFor(mimeType)) {
      throw badRequest("File too large");
    }

    const ext = MIME_TO_EXT[mimeType];
    const storedName = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
    const destRel = `${ATTACHMENTS_DIR}/${storedName}`;
    const pm = req.projectCtx!.projectManager;
    const root = pm.getRootPath();
    const destAbs = resolveProjectPath(root, destRel);
    assertInsideProject(root, destAbs, destRel);

    const attachmentsRoot = resolveProjectPath(root, ATTACHMENTS_DIR);
    if (!isPathInside(attachmentsRoot, destAbs)) {
      throw forbidden("Access denied");
    }

    await pm.writeBinaryFile(destRel, fileBuffer!);

    return {
      type: mimeType.startsWith("image/") ? "image" : "file",
      path: destRel,
      mimeType,
      name: filename || storedName,
      width,
      height,
      bytes: fileBuffer.byteLength,
    };
  });

  fastify.delete<{
    Params: { projectId: string };
    Body: { path?: string };
  }>("/api/projects/:projectId/attachments", async (req) => {
    const targetPath = req.body?.path;
    if (typeof targetPath !== "string" || targetPath.length === 0) {
      throw badRequest("Missing 'path'");
    }
    const pm = req.projectCtx!.projectManager;
    const root = pm.getRootPath();
    let targetAbs: string;
    try {
      targetAbs = resolveProjectPath(root, targetPath);
      assertInsideProject(root, targetAbs, targetPath);
    } catch (err) {
      if (err instanceof AccessDeniedError) throw forbidden("Access denied");
      throw err;
    }

    const attachmentsRoot = resolveProjectPath(root, ATTACHMENTS_DIR);
    if (!isPathInside(attachmentsRoot, targetAbs)) {
      throw forbidden("Access denied");
    }

    try {
      await pm.deletePath(targetPath);
    } catch (err) {
      if (err instanceof AccessDeniedError) throw forbidden("Access denied");
      throw err;
    }
    return { ok: true };
  });

  fastify.get<{
    Params: { projectId: string; "*": string };
  }>(
    "/api/projects/:projectId/attachments/download/*",
    async (
      req: FastifyRequest<{ Params: { projectId: string; "*": string } }>,
      reply: FastifyReply,
    ) => {
      const relativePath = req.params["*"];
      const pm = req.projectCtx!.projectManager;
      const root = pm.getRootPath();
      const policy = serverAccessPolicy(root);
      try {
        policy.assertRead(relativePath);
      } catch (err) {
        if (err instanceof AccessDeniedError) throw forbidden("Access denied");
        throw err;
      }
      let absolutePath: string;
      try {
        absolutePath = resolveProjectPath(root, relativePath);
        assertInsideProject(root, absolutePath, relativePath);
      } catch (err) {
        if (err instanceof AccessDeniedError) throw forbidden("Access denied");
        throw err;
      }
      const attachmentsRoot = resolveProjectPath(root, ATTACHMENTS_DIR);
      if (!isPathInside(attachmentsRoot, absolutePath)) {
        throw forbidden("Access denied");
      }
      try {
        await fs.stat(absolutePath);
      } catch {
        throw notFound("Not found");
      }
      const ext = path.extname(absolutePath).slice(1).toLowerCase();
      return reply
        .type(DOWNLOAD_CONTENT_TYPES[ext] ?? "application/octet-stream")
        .header("Cache-Control", "no-cache")
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(path.basename(absolutePath))}"`,
        )
        .send(createReadStream(absolutePath));
    },
  );
}
