import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { llmAccessPolicy, type AccessPolicy } from "../access/access-policy.js";

export function permissivePolicy(projectRoot: string): () => AccessPolicy {
  return () => llmAccessPolicy(projectRoot, []);
}

export async function createTempProject(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-test-"));
  return tmpDir;
}

export async function cleanupDir(dir: string): Promise<void> {
  // Windows teardown after killing a child can take seconds (taskkill +
  // console-subsystem release have been observed near ~7s on slow hosts);
  // poll generously before giving up. Harmless on POSIX, where the first
  // attempt normally succeeds.
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

export async function writeFile(dir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(dir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

export async function readFile(dir: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(dir, relativePath), "utf-8");
}

export async function removeFile(dir: string, relativePath: string): Promise<void> {
  await fs.rm(path.join(dir, relativePath), { force: true });
}

export async function ensureDir(dir: string, relativePath: string): Promise<void> {
  await fs.mkdir(path.join(dir, relativePath), { recursive: true });
}

export function pathExists(dir: string, relativePath: string): boolean {
  return fsSync.existsSync(path.join(dir, relativePath));
}
