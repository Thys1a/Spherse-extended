import fs from "node:fs";
import path from "node:path";

export const STALE_ELECTRON_SHORTCUT_NAME = "Electron.lnk";

const LINK_MAGIC = 0x0000004c;
const HAS_LINK_TARGET_ID_LIST = 0x01;
const HAS_LINK_INFO = 0x02;
const LINK_INFO_HAS_LOCAL_BASE_PATH = 0x01;
const PROPERTY_STORE_SIGNATURE = 0xa0000009;
// PKEY_AppUserModel_ID = {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, pid 5.
const APP_USER_MODEL_ID_FMTID = Buffer.from([
  0x55, 0x28, 0x4c, 0x9f, 0x79, 0x9f, 0x39, 0x4b, 0xa8, 0xd0, 0xe1, 0xd4, 0x2d, 0xe1, 0xd5, 0xf3,
]);
const APP_USER_MODEL_ID_PID = 5;
const VT_LPWSTR = 0x001f;

export interface ShortcutIdentity {
  appUserModelId: string | null;
  targetPath: string | null;
}

export function parseShortcutIdentity(buffer: Buffer): ShortcutIdentity {
  if (buffer.length < 76 || buffer.readUInt32LE(0) !== LINK_MAGIC) {
    throw new Error("not a shell link");
  }
  const flags = buffer.readUInt32LE(20);
  let cursor = 76;
  if (flags & HAS_LINK_TARGET_ID_LIST) {
    if (cursor + 2 > buffer.length) throw new Error("truncated id list");
    cursor += 2 + buffer.readUInt16LE(cursor);
  }
  let targetPath: string | null = null;
  if (flags & HAS_LINK_INFO) {
    if (cursor + 4 > buffer.length) throw new Error("truncated link info");
    const end = cursor + buffer.readUInt32LE(cursor);
    const headerSize = buffer.readUInt32LE(cursor + 4);
    const infoFlags = buffer.readUInt32LE(cursor + 8);
    if (infoFlags & LINK_INFO_HAS_LOCAL_BASE_PATH) {
      if (headerSize >= 36 && cursor + 32 <= end) {
        const unicodeOffset = buffer.readUInt32LE(cursor + 28);
        if (unicodeOffset > 0) {
          targetPath = readNullTerminatedUtf16(buffer, cursor + unicodeOffset) ?? targetPath;
        }
      }
      if (targetPath === null && cursor + 20 <= end) {
        const ansiOffset = buffer.readUInt32LE(cursor + 16);
        if (ansiOffset > 0) {
          targetPath = readNullTerminatedAnsi(buffer, cursor + ansiOffset);
        }
      }
    }
    cursor = end;
  }
  for (const bit of [0x04, 0x08, 0x10, 0x20, 0x40]) {
    if (flags & bit) {
      if (cursor + 2 > buffer.length) throw new Error("truncated string data");
      cursor += 2 + buffer.readUInt16LE(cursor) * 2;
    }
  }
  let appUserModelId: string | null = null;
  while (cursor + 8 <= buffer.length) {
    const blockSize = buffer.readUInt32LE(cursor);
    if (blockSize < 8) break;
    if (cursor + blockSize > buffer.length) break;
    if (buffer.readUInt32LE(cursor + 4) === PROPERTY_STORE_SIGNATURE) {
      appUserModelId = findAppUserModelId(buffer.subarray(cursor + 8, cursor + blockSize));
      if (appUserModelId !== null) break;
    }
    cursor += blockSize;
  }
  return { appUserModelId, targetPath };
}

function readNullTerminatedAnsi(buffer: Buffer, offset: number): string | null {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return end === offset ? null : buffer.subarray(offset, end).toString("latin1");
}

function readNullTerminatedUtf16(buffer: Buffer, offset: number): string | null {
  let end = offset;
  while (end + 1 < buffer.length && (buffer[end] !== 0 || buffer[end + 1] !== 0)) end += 2;
  return end === offset ? null : buffer.subarray(offset, end).toString("utf16le");
}

function findAppUserModelId(payload: Buffer): string | null {
  for (let i = 0; i + 22 <= payload.length; i += 1) {
    if (!payload.subarray(i, i + 16).equals(APP_USER_MODEL_ID_FMTID)) continue;
    for (let j = i + 16; j + 12 <= payload.length; j += 1) {
      if (payload.readUInt32LE(j) !== APP_USER_MODEL_ID_PID) continue;
      // Real Windows writers insert a pad byte between pid and type.
      for (const typeOffset of [4, 5]) {
        if (payload.readUInt16LE(j + typeOffset) !== VT_LPWSTR) continue;
        const decoded = decodeLPWSTR(payload, j + typeOffset + 4);
        if (decoded !== null) return decoded;
      }
    }
  }
  return null;
}

function decodeLPWSTR(payload: Buffer, cursor: number): string | null {
  if (cursor + 4 > payload.length) return null;
  const length = payload.readUInt32LE(cursor);
  const data = payload.subarray(cursor + 4);
  for (const byteLength of [length, length * 2]) {
    if (byteLength < 2 || byteLength > data.length) continue;
    if (data[byteLength - 2] !== 0 || data[byteLength - 1] !== 0) continue;
    const text = data.subarray(0, byteLength - 2).toString("utf16le");
    if (isPlausibleAppUserModelId(text)) return text;
  }
  return null;
}

function isPlausibleAppUserModelId(text: string): boolean {
  return text.length >= 1 && text.length <= 256 && /^[\x20-\x7e]+$/.test(text);
}

export function shouldRemoveStaleElectronShortcut(
  fileName: string,
  identity: ShortcutIdentity,
  expectedAppUserModelId: string,
): boolean {
  if (fileName !== STALE_ELECTRON_SHORTCUT_NAME) return false;
  if (identity.appUserModelId !== expectedAppUserModelId) return false;
  return (identity.targetPath ?? "").toLowerCase().includes("electron.exe");
}

export type StaleShortcutCleanup = "removed" | "absent" | "kept";

export function removeStaleElectronShortcut(options: {
  startMenuDir: string;
  expectedAppUserModelId: string;
}): StaleShortcutCleanup {
  const filePath = path.join(options.startMenuDir, STALE_ELECTRON_SHORTCUT_NAME);
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return "absent";
  }
  let identity: ShortcutIdentity;
  try {
    identity = parseShortcutIdentity(buffer);
  } catch {
    return "kept";
  }
  if (
    !shouldRemoveStaleElectronShortcut(
      STALE_ELECTRON_SHORTCUT_NAME,
      identity,
      options.expectedAppUserModelId,
    )
  ) {
    return "kept";
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    return "kept";
  }
  return "removed";
}
