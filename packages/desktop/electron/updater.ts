import { app, powerMonitor } from "electron";
import type { BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
const { autoUpdater, CancellationToken } = electronUpdater;
type CancellationTokenType = electronUpdater.CancellationToken;
import type { UpdateState, UpdateEvent } from "./types.js";
import { getMainWindow } from "./window.js";

// 更新检测源：本仓库的 GitHub Releases（latest 非预发布）。
// 不再使用上游的 OSS 清单（上游渠道，已下线）。
const GITHUB_RELEASES_LATEST_URL =
  "https://api.github.com/repos/Thys1a/Spherse-extended/releases/latest";

/**
 * 更新清单结构（与 landing `resolveDownloadUrl` 对齐；`win.setup` 为旧版清单键名，
 * 保留兼容回退；`linux.x64` 与 `win.arm64` 为可选键——旧版本 release 缺失时省略，
 * 读取端回退）。
 */
export interface UpdateManifest {
  version: string;
  mac?: { arm64?: string; intel?: string };
  win?: { x64?: string; arm64?: string; setup?: string };
  linux?: { x64?: string };
}

interface GithubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GithubRelease {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

function assetUrl(
  assets: GithubReleaseAsset[],
  predicate: (name: string) => boolean,
): string | undefined {
  const found = assets.find(
    (a) => typeof a.name === "string" && predicate(a.name),
  );
  return typeof found?.browser_download_url === "string"
    ? found.browser_download_url
    : undefined;
}

/**
 * GitHub latest release → 更新清单。命名约定见 CI（dmg 按 arm64/intel 后缀，
 * exe 按 arch 后缀，AppImage 为 linux 包）。draft/prerelease 返回 null
 * （调用方视为无更新，不报错）。
 */
export function manifestFromGithubRelease(
  release: GithubRelease,
): UpdateManifest | null {
  if (release.draft === true || release.prerelease === true) return null;
  const version =
    typeof release.tag_name === "string"
      ? release.tag_name.replace(/^v/, "")
      : "";
  if (!version) return null;
  const assets = Array.isArray(release.assets)
    ? (release.assets as GithubReleaseAsset[])
    : [];
  const manifest: UpdateManifest = { version };
  const arm64Dmg = assetUrl(assets, (n) => n.endsWith("-arm64.dmg"));
  const intelDmg = assetUrl(assets, (n) => n.endsWith("-intel.dmg"));
  if (arm64Dmg !== undefined || intelDmg !== undefined) {
    manifest.mac = {};
    if (arm64Dmg !== undefined) manifest.mac.arm64 = arm64Dmg;
    if (intelDmg !== undefined) manifest.mac.intel = intelDmg;
  }
  const x64Exe = assetUrl(
    assets,
    (n) => n.endsWith("-x64.exe") && !n.includes("arm64"),
  );
  const arm64Exe = assetUrl(assets, (n) => n.endsWith("-arm64.exe"));
  if (x64Exe !== undefined || arm64Exe !== undefined) {
    manifest.win = {};
    if (x64Exe !== undefined) manifest.win.x64 = x64Exe;
    if (arm64Exe !== undefined) manifest.win.arm64 = arm64Exe;
  }
  const appImage = assetUrl(assets, (n) => n.endsWith(".AppImage"));
  if (appImage !== undefined) manifest.linux = { x64: appImage };
  return manifest;
}

export function resolveDownloadUrlFromManifest(
  manifest: UpdateManifest,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  if (platform === "darwin") {
    // x64 Mac 跑的是 intel 包（反之亦然，缺键时互为回退）；全缺 → undefined
    return arch === "arm64"
      ? (manifest.mac?.arm64 ?? manifest.mac?.intel)
      : (manifest.mac?.intel ?? manifest.mac?.arm64);
  }
  if (platform === "win32") {
    // x64 包在 ARM64 Windows 可模拟运行（与 landing 语义一致）
    if (arch === "arm64") {
      return manifest.win?.arm64 ?? manifest.win?.x64 ?? manifest.win?.setup;
    }
    return manifest.win?.x64 ?? manifest.win?.setup;
  }
  if (platform === "linux") {
    return manifest.linux?.x64;
  }
  return undefined;
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

export interface Updater {
  checkForUpdates(opts: { silent: boolean }): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  cancelUpdate(): Promise<void>;
  getState(): UpdateState;
}

export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  const pb = b
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function createUpdater(getWindow: () => BrowserWindow | null): Updater {
  let currentState: UpdateState = { status: "idle" };
  let activeCancellationToken: CancellationTokenType | null = null;

  function sendEvent(event: UpdateEvent): void {
    getWindow()?.webContents.send(event.type, event);
  }

  autoUpdater.on("update-available", (info) => {
    const releaseNotes =
      typeof info.releaseNotes === "string" ? info.releaseNotes : "";
    currentState = {
      status: "available",
      version: info.version,
      releaseNotes,
    };
    sendEvent({
      type: "update-available",
      version: info.version,
      releaseNotes,
      silent: false,
    });
  });

  autoUpdater.on("update-not-available", () => {
    currentState = { status: "upToDate" };
    sendEvent({ type: "update-not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    currentState = { ...currentState, status: "downloading", percent };
    sendEvent({ type: "download-progress", percent });
  });

  autoUpdater.on("update-downloaded", () => {
    currentState = {
      status: "downloaded",
      version: currentState.version,
      releaseNotes: currentState.releaseNotes,
    };
    sendEvent({ type: "update-downloaded" });
  });

  autoUpdater.on("error", (err: unknown) => {
    const errorMessage =
      err instanceof Error ? err.message : String(err ?? "");
    currentState = { status: "error", errorMessage };
    sendEvent({ type: "update-error", message: errorMessage });
  });

  async function checkForUpdatesViaGithub(silent: boolean): Promise<void> {
    if (!silent) currentState = { status: "checking" };
    try {
      const res = await fetch(GITHUB_RELEASES_LATEST_URL);
      if (!res.ok) {
        throw new Error(`GitHub release responded ${res.status}`);
      }
      const manifest = manifestFromGithubRelease(
        (await res.json()) as GithubRelease,
      );
      const version = manifest?.version ?? "";
      const current = app.getVersion();
      if (manifest && compareVersions(version, current) > 0) {
        const downloadUrl = resolveDownloadUrlFromManifest(manifest);
        // GitHub body 为 markdown，UI 按纯文本展示会有噪音，留空由 UI 自动隐藏
        const releaseNotes = "";
        if (!silent) {
          currentState = {
            status: "available",
            version,
            releaseNotes,
            downloadUrl,
          };
        }
        sendEvent({
          type: "update-available",
          version,
          releaseNotes,
          downloadUrl,
          silent,
        });
      } else {
        if (silent) return;
        currentState = { status: "upToDate" };
        sendEvent({ type: "update-not-available" });
      }
    } catch (err: unknown) {
      if (silent) return;
      const errorMessage =
        err instanceof Error ? err.message : String(err ?? "");
      currentState = { status: "error", errorMessage };
      sendEvent({ type: "update-error", message: errorMessage });
    }
  }

  return {
    async checkForUpdates(opts: { silent: boolean }): Promise<void> {
      if (!app.isPackaged) {
        if (opts.silent) return;
        currentState = { status: "upToDate" };
        sendEvent({ type: "update-not-available" });
        return;
      }
      // mac/win 统一走 GitHub Releases 检测 + 引导浏览器下载（前往下载）。
      // electron-updater 的 GitHub feed 自 ba8c049 起无 latest.yml，不再使用；
      // 其 in-app 下载 API 保留给未来恢复 feed（backlog #149）。
      await checkForUpdatesViaGithub(opts.silent);
    },

    async downloadUpdate(): Promise<void> {
      if (process.platform !== "win32") return;
      currentState = { status: "downloading" };
      activeCancellationToken = new CancellationToken();
      await autoUpdater.downloadUpdate(activeCancellationToken);
    },

    installUpdate(): Promise<void> {
      if (process.platform !== "win32") return Promise.resolve();
      autoUpdater.quitAndInstall();
      return Promise.resolve();
    },

    async cancelUpdate(): Promise<void> {
      if (process.platform !== "win32") return;
      activeCancellationToken?.cancel();
      activeCancellationToken = null;
      currentState = { status: "idle" };
    },

    getState(): UpdateState {
      return { ...currentState };
    },
  };
}

export const updater = createUpdater(() => getMainWindow());

const AUTO_CHECK_STARTUP_DELAY_MS = 5_000;
const AUTO_CHECK_TICK_MS = 60 * 60 * 1000;
const AUTO_CHECK_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_CHECK_USER_ACTIVE_IDLE_SEC = 300;

export function startAutoUpdateChecks(): void {
  let lastCheckAt = 0;
  const runCheck = (): void => {
    lastCheckAt = Date.now();
    void updater.checkForUpdates({ silent: true });
  };
  setTimeout(runCheck, AUTO_CHECK_STARTUP_DELAY_MS);
  setInterval(() => {
    if (Date.now() - lastCheckAt < AUTO_CHECK_MIN_INTERVAL_MS) return;
    if (powerMonitor.getSystemIdleTime() > AUTO_CHECK_USER_ACTIVE_IDLE_SEC) {
      return;
    }
    runCheck();
  }, AUTO_CHECK_TICK_MS);
}
