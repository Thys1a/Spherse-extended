import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 发版事故回归（v0.3.2-alpha：包里 server 是 9 天前的旧构建）。
 *
 * 根因：predist 只跑 rebuild-native + electron-vite build（renderer），
 * server/core/contracts 的 dist/ 原样打进包。renderer 调新 API
 * （content move、commands、preview 文本类），包里 server 全部 404/400。
 * CI 没事是因为它先跑 npm run build:desktop；本地 npm run dist 才踩坑。
 *
 * 本测试锁定：predist 必须走全拓扑构建链（含 @spherse/server），
 * 不允许退回只编 renderer。
 */

interface PackageJson {
  scripts?: Record<string, string>;
}

function loadDesktopPackageJson(): PackageJson {
  const url = new URL("./package.json", import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as PackageJson;
}

function loadRootPackageJson(): PackageJson {
  const url = new URL("../../package.json", import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as PackageJson;
}

describe("predist 构建链（新皮旧馅回归）", () => {
  const predist = loadDesktopPackageJson().scripts?.["predist"] ?? "";
  const desktopChain = loadRootPackageJson().scripts?.["build:desktop"] ?? "";

  it("predist 走 build:desktop 全拓扑链", () => {
    expect(predist).toContain("build:desktop");
  });

  it("build:desktop 覆盖 @spherse/server（renderer 调的新 API 必须有新 server）", () => {
    for (const workspace of [
      "@spherse/i18n",
      "@spherse/presets",
      "@spherse/sdk",
      "@spherse/core",
      "@spherse/contracts",
      "@spherse/server",
      "@spherse/desktop",
    ]) {
      expect(desktopChain).toContain(workspace);
    }
  });

  it("predist 不止于 electron-vite build", () => {
    expect(predist.trim()).not.toBe("electron-vite build");
  });
});
