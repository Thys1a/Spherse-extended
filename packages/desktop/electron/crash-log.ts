import fs from "node:fs";
import path from "node:path";

export interface CrashRecord {
  time: string;
  proc: string;
  reason?: string;
  exitCode?: number;
  url?: string;
  name?: string;
  kind?: "uncaughtException" | "unhandledRejection";
  stack?: string;
}

export const RELOAD_BACKOFF_WINDOW_MS = 60_000;
export const MAX_RELOADS_PER_WINDOW = 3;

export type RecoveryAction = "none" | "reload" | "recreate";

export function resolveCrashLogDir(userDataDir: string): string {
  return path.join(userDataDir, "logs");
}

export function crashLogFileName(): string {
  return "crash.jsonl";
}

export function appendCrashLog(logDir: string, rec: CrashRecord): void {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, crashLogFileName()), `${JSON.stringify(rec)}\n`, "utf-8");
}

export function safeAppendCrashLog(logDir: string, rec: CrashRecord): void {
  try {
    appendCrashLog(logDir, rec);
  } catch {
    console.error("[crash] failed to write crash log", rec);
  }
}

export function pruneCrashTimes(crashTimes: number[], now: number): number[] {
  return crashTimes.filter((t) => now - t < RELOAD_BACKOFF_WINDOW_MS);
}

export function decideRendererRecovery(opts: {
  cleanExit: boolean;
  quitting: boolean;
  windowDestroyed: boolean;
  crashTimes: number[];
  now: number;
}): { action: RecoveryAction; crashTimes: number[] } {
  if (opts.cleanExit || opts.quitting) {
    return { action: "none", crashTimes: opts.crashTimes };
  }
  const recent = pruneCrashTimes(opts.crashTimes, opts.now);
  if (recent.length >= MAX_RELOADS_PER_WINDOW) {
    return { action: "none", crashTimes: recent };
  }
  return {
    action: opts.windowDestroyed ? "recreate" : "reload",
    crashTimes: [...recent, opts.now],
  };
}
