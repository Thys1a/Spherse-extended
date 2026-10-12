import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Set packages/desktop to a channel version, keeping package-lock.json in sync
// so a later `npm ci` stays valid. Edits JSON directly (no `npm version`
// side effects).
//
// Usage:
//   node scripts/sync-desktop-version.mjs --channel=alpha|beta|stable [--version=X.Y.Z]
//   DIST_VERSION=X.Y.Z node scripts/sync-desktop-version.mjs --channel=alpha
//
// Base version source (first wins): --version flag > DIST_VERSION env >
// packages/desktop/package.json with any existing suffix stripped.
// Prints the final version to stdout.

const args = process.argv.slice(2);
function flagValue(name) {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const channel = flagValue("channel") ?? "stable";
if (!["alpha", "beta", "stable"].includes(channel)) {
  console.error(`unknown channel: ${channel} (expected alpha|beta|stable)`);
  process.exit(1);
}

const desktopPkgPath = resolve(root, "packages/desktop/package.json");
const current = readJson(desktopPkgPath).version;
const raw = flagValue("version") ?? process.env.DIST_VERSION ?? current;
const base = String(raw).trim().replace(/-.*$/, "");
if (!/^\d+\.\d+\.\d+$/.test(base)) {
  console.error(`invalid base version: ${raw} (expected X.Y.Z)`);
  process.exit(1);
}
const final = channel === "stable" ? base : `${base}-${channel}`;

const desktopPkg = readJson(desktopPkgPath);
desktopPkg.version = final;
writeJson(desktopPkgPath, desktopPkg);

// Keep package-lock.json in sync so a later `npm ci` stays valid.
const lockPath = resolve(root, "package-lock.json");
const lock = readJson(lockPath);
if (lock.packages?.["packages/desktop"]) {
  lock.packages["packages/desktop"].version = final;
  writeJson(lockPath, lock);
}

console.log(final);
