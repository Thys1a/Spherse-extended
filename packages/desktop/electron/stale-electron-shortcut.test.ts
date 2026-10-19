import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyReadError,
  parseShortcutIdentity,
  removeStaleElectronShortcut,
  shouldRemoveStaleElectronShortcut,
} from "./stale-electron-shortcut.js";

const OUR_ID = "com.spherse.app";

function buildLink(options: {
  target: string;
  appUserModelId: string | null;
  windowsStyleStore?: boolean;
  withIdList?: boolean;
  withStrings?: boolean;
}): Buffer {
  const parts: Buffer[] = [];
  const header = Buffer.alloc(76);
  header.writeUInt32LE(0x4c, 0);
  header.writeUInt32LE(
    0x02 | (options.withIdList ? 0x01 : 0) | (options.withStrings ? 0x04 | 0x10 : 0),
    20,
  );
  parts.push(header);
  if (options.withIdList) {
    const idList = Buffer.alloc(6);
    idList.writeUInt16LE(4, 0);
    parts.push(idList);
  }
  const targetAnsi = Buffer.from(`${options.target}\0`, "latin1");
  const targetUtf16 = Buffer.from(`${options.target}\0`, "utf16le");
  const linkInfoSize = 36 + targetAnsi.length + targetUtf16.length;
  const linkInfo = Buffer.alloc(linkInfoSize);
  linkInfo.writeUInt32LE(linkInfoSize, 0);
  linkInfo.writeUInt32LE(36, 4);
  linkInfo.writeUInt32LE(0x01, 8);
  linkInfo.writeUInt32LE(36, 16);
  linkInfo.writeUInt32LE(36 + targetAnsi.length, 28);
  targetAnsi.copy(linkInfo, 36);
  targetUtf16.copy(linkInfo, 36 + targetAnsi.length);
  parts.push(linkInfo);
  if (options.withStrings) {
    for (const text of ["nm", "C:\\w"]) {
      const encoded = Buffer.from(text, "utf16le");
      const segment = Buffer.alloc(2 + encoded.length);
      segment.writeUInt16LE(text.length, 0);
      encoded.copy(segment, 2);
      parts.push(segment);
    }
  }
  if (options.appUserModelId !== null) {
    const value = Buffer.from(`${options.appUserModelId}\0`, "utf16le");
    const propValue = Buffer.alloc(8 + value.length);
    propValue.writeUInt16LE(0x001f, 0);
    propValue.writeUInt32LE(options.windowsStyleStore ? value.length / 2 : value.length, 4);
    value.copy(propValue, 8);
    const fmtid = Buffer.from([
      0x55, 0x28, 0x4c, 0x9f, 0x79, 0x9f, 0x39, 0x4b, 0xa8, 0xd0, 0xe1, 0xd4, 0x2d, 0xe1, 0xd5,
      0xf3,
    ]);
    const pid = Buffer.alloc(4);
    pid.writeUInt32LE(5, 0);
    const prefix = options.windowsStyleStore ? Buffer.from([0x1d, 0, 0, 0, 0x1a, 0, 0, 0]) : Buffer.alloc(0);
    const pad = options.windowsStyleStore ? Buffer.from([0]) : Buffer.alloc(0);
    const payload = Buffer.concat([fmtid, prefix, pid, pad, propValue]);
    const blockSize = 8 + payload.length;
    const block = Buffer.alloc(blockSize);
    block.writeUInt32LE(blockSize, 0);
    block.writeUInt32LE(0xa0000009, 4);
    payload.copy(block, 8);
    parts.push(block);
  }
  const terminal = Buffer.alloc(4);
  parts.push(terminal);
  return Buffer.concat(parts);
}

describe("parseShortcutIdentity", () => {
  it("reads target and AppUserModelId from LinkInfo and property store", () => {
    const identity = parseShortcutIdentity(
      buildLink({ target: "C:\\x\\electron.exe", appUserModelId: OUR_ID }),
    );
    expect(identity).toEqual({ appUserModelId: OUR_ID, targetPath: "C:\\x\\electron.exe" });
  });

  it("returns null AppUserModelId when the property store block is absent", () => {
    const identity = parseShortcutIdentity(
      buildLink({ target: "C:\\x\\electron.exe", appUserModelId: null }),
    );
    expect(identity).toEqual({ appUserModelId: null, targetPath: "C:\\x\\electron.exe" });
  });

  it("reads Windows-style stores with character-count lengths and extra entries", () => {
    const identity = parseShortcutIdentity(
      buildLink({ target: "C:\\x\\electron.exe", appUserModelId: OUR_ID, windowsStyleStore: true }),
    );
    expect(identity).toEqual({ appUserModelId: OUR_ID, targetPath: "C:\\x\\electron.exe" });
  });

  it("skips id lists and string data like real Windows links carry", () => {
    const identity = parseShortcutIdentity(
      buildLink({
        target: "C:\\x\\electron.exe",
        appUserModelId: OUR_ID,
        windowsStyleStore: true,
        withIdList: true,
        withStrings: true,
      }),
    );
    expect(identity).toEqual({ appUserModelId: OUR_ID, targetPath: "C:\\x\\electron.exe" });
  });

  it("rejects non-link buffers", () => {
    expect(() => parseShortcutIdentity(Buffer.from([1, 2, 3]))).toThrow();
  });
});

describe("shouldRemoveStaleElectronShortcut", () => {
  const stale = { appUserModelId: OUR_ID, targetPath: "D:\\x\\electron.exe" };

  it("removes the stale dev artifact", () => {
    expect(shouldRemoveStaleElectronShortcut("Electron.lnk", stale, OUR_ID)).toBe(true);
  });

  it("never touches Spherse.lnk", () => {
    expect(
      shouldRemoveStaleElectronShortcut(
        "Spherse.lnk",
        { appUserModelId: OUR_ID, targetPath: "D:\\note\\Spherse\\Spherse.exe" },
        OUR_ID,
      ),
    ).toBe(false);
  });

  it("keeps foreign Electron shortcuts with a different AppUserModelId", () => {
    expect(
      shouldRemoveStaleElectronShortcut(
        "Electron.lnk",
        { appUserModelId: "electron.app.Electron", targetPath: "D:\\x\\electron.exe" },
        OUR_ID,
      ),
    ).toBe(false);
  });

  it("keeps Electron.lnk when the target is not electron.exe", () => {
    expect(
      shouldRemoveStaleElectronShortcut(
        "Electron.lnk",
        { appUserModelId: OUR_ID, targetPath: "D:\\note\\Spherse\\Spherse.exe" },
        OUR_ID,
      ),
    ).toBe(false);
  });

  it("keeps unparseable shortcuts", () => {
    expect(
      shouldRemoveStaleElectronShortcut("Electron.lnk", { appUserModelId: null, targetPath: null }, OUR_ID),
    ).toBe(false);
  });
});

describe("removeStaleElectronShortcut", () => {
  it("removes the file and reports removed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-lnk-test-"));
    try {
      fs.writeFileSync(
        path.join(dir, "Electron.lnk"),
        buildLink({ target: "D:\\x\\electron.exe", appUserModelId: OUR_ID }),
      );
      expect(removeStaleElectronShortcut({ startMenuDir: dir, expectedAppUserModelId: OUR_ID })).toBe(
        "removed",
      );
      expect(fs.existsSync(path.join(dir, "Electron.lnk"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports absent when there is nothing to clean", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-lnk-test-"));
    try {
      expect(removeStaleElectronShortcut({ startMenuDir: dir, expectedAppUserModelId: OUR_ID })).toBe(
        "absent",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("distinguishes missing files from read failures", () => {
    expect(classifyReadError(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe("kept");
    expect(classifyReadError(Object.assign(new Error("missing"), { code: "ENOENT" }))).toBe(
      "absent",
    );
    expect(classifyReadError(new Error("unknown"))).toBe("kept");
  });

  it("keeps Spherse.lnk files on disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-lnk-test-"));
    try {
      fs.writeFileSync(
        path.join(dir, "Spherse.lnk"),
        buildLink({ target: "D:\\note\\Spherse\\Spherse.exe", appUserModelId: OUR_ID }),
      );
      expect(removeStaleElectronShortcut({ startMenuDir: dir, expectedAppUserModelId: OUR_ID })).toBe(
        "absent",
      );
      expect(fs.existsSync(path.join(dir, "Spherse.lnk"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
