import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendCrashLog,
  crashLogFileName,
  decideRendererRecovery,
  pruneCrashTimes,
  resolveCrashLogDir,
  MAX_RELOADS_PER_WINDOW,
  RELOAD_BACKOFF_WINDOW_MS,
} from "./crash-log.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-crash-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("resolveCrashLogDir", () => {
  it("resolves the logs dir under userData", () => {
    expect(resolveCrashLogDir("/data/user")).toBe(path.join("/data/user", "logs"));
  });
});

describe("appendCrashLog", () => {
  it("appends one JSON object per line", () => {
    const logDir = path.join(makeTmpDir(), "logs");
    appendCrashLog(logDir, { time: "t1", proc: "renderer", reason: "oom", exitCode: 1 });
    appendCrashLog(logDir, { time: "t2", proc: "main", kind: "uncaughtException", stack: "boom" });
    const lines = fs.readFileSync(path.join(logDir, crashLogFileName()), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ proc: "renderer", reason: "oom", exitCode: 1 });
    expect(JSON.parse(lines[1])).toMatchObject({ proc: "main", kind: "uncaughtException" });
  });
});

describe("pruneCrashTimes", () => {
  it("drops entries outside the backoff window", () => {
    const now = 1_000_000;
    expect(pruneCrashTimes([now - RELOAD_BACKOFF_WINDOW_MS - 1, now - 1_000, now], now)).toEqual([
      now - 1_000,
      now,
    ]);
  });
});

describe("decideRendererRecovery", () => {
  const base = { quitting: false, windowDestroyed: false, crashTimes: [] as number[], now: 1_000_000 };

  it("does nothing on clean exit", () => {
    expect(decideRendererRecovery({ ...base, cleanExit: true }).action).toBe("none");
  });

  it("does nothing while quitting", () => {
    expect(decideRendererRecovery({ ...base, cleanExit: false, quitting: true }).action).toBe("none");
  });

  it("reloads a live window", () => {
    const out = decideRendererRecovery({ ...base, cleanExit: false });
    expect(out.action).toBe("reload");
    expect(out.crashTimes).toEqual([base.now]);
  });

  it("recreates a destroyed window", () => {
    const out = decideRendererRecovery({ ...base, cleanExit: false, windowDestroyed: true });
    expect(out.action).toBe("recreate");
  });

  it("stops after too many crashes in the window", () => {
    const crashTimes = Array.from({ length: MAX_RELOADS_PER_WINDOW }, (_, i) => base.now - (i + 1) * 1_000);
    const out = decideRendererRecovery({ ...base, cleanExit: false, crashTimes });
    expect(out.action).toBe("none");
    expect(out.crashTimes).toHaveLength(MAX_RELOADS_PER_WINDOW);
  });
});
