import { GITHUB_API_REPO_URL, GITHUB_RELEASES_LATEST_URL } from "./urls";

export type Platform = "mac" | "win" | "linux";

export function detectPlatform(): Platform {
  // Android 的 UA / navigator.platform 都含 "Linux"，但它不是桌面 Linux 发布目标
  const isAndroid = /android/i.test(navigator.userAgent);
  try {
    const uaData = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData;
    const platform = (uaData?.platform ?? navigator.platform ?? "").toLowerCase();
    if (platform.includes("win")) return "win";
    if (platform.includes("mac")) return "mac";
    if (platform.includes("linux") && !isAndroid) return "linux";
  } catch {
    // ignore — fall through to userAgent check
  }
  if (/win(?:dows)?/i.test(navigator.userAgent)) return "win";
  if (!isAndroid && /linux/i.test(navigator.userAgent)) return "linux";
  return "mac";
}

export interface Manifest {
  version: string;
  mac: { arm64: string; intel: string };
  win: { x64?: string; arm64?: string; setup?: string };
  // 可选键：pre-Linux 时代的旧 manifest / workflow_dispatch 重发旧 tag 时缺失
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
): string {
  const found = assets.find(
    (a) => typeof a.name === "string" && predicate(a.name),
  );
  return typeof found?.browser_download_url === "string"
    ? found.browser_download_url
    : "";
}

export async function fetchLatestManifest(): Promise<Manifest> {
  // 直接读本仓库的 GitHub Releases（latest 为最近正式版）。
  // 缺资产时填空串，由 platformCards 过滤、resolveDownloadUrl 兜底。
  const res = await fetch(`${GITHUB_API_REPO_URL}/releases/latest`);
  if (!res.ok) throw new Error(`GitHub releases responded ${res.status}`);
  const release = (await res.json()) as GithubRelease;
  const version =
    typeof release.tag_name === "string"
      ? release.tag_name.replace(/^v/, "")
      : "";
  if (!version || release.draft === true || release.prerelease === true) {
    throw new Error("No stable release found");
  }
  const assets = Array.isArray(release.assets)
    ? (release.assets as GithubReleaseAsset[])
    : [];
  return {
    version,
    mac: {
      arm64: assetUrl(assets, (n) => n.endsWith("-arm64.dmg")),
      intel: assetUrl(assets, (n) => n.endsWith("-intel.dmg")),
    },
    win: {
      x64: assetUrl(assets, (n) => n.endsWith("-x64.exe")),
      arm64: assetUrl(assets, (n) => n.endsWith("-arm64.exe")),
    },
    linux: {
      x64: assetUrl(assets, (n) => n.endsWith(".AppImage")),
    },
  };
}

async function detectWinArch(): Promise<"arm64" | "x64"> {
  try {
    const uaData = (
      navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues?: (hints: string[]) => Promise<{
            architecture?: string;
          }>;
        };
      }
    ).userAgentData;
    const hints = await uaData?.getHighEntropyValues?.(["architecture"]);
    if (hints?.architecture === "arm") return "arm64";
  } catch {
    // ignore — fall through to default
  }
  return "x64";
}

function detectMacArch(): "arm64" | "intel" {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("webgl2") as WebGLRenderingContext | null);
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      if (/Apple\s?(M\d|GPU)/i.test(renderer)) return "arm64";
      if (/Intel/i.test(renderer)) return "intel";
    }
  } catch {
    // ignore — fall through to default
  }
  return "arm64";
}

export async function resolveDownloadUrl(platform: Platform): Promise<string> {
  try {
    const manifest = await fetchLatestManifest();
    if (platform === "win") {
      const arch = await detectWinArch();
      if (arch === "arm64" && manifest.win?.arm64) return manifest.win.arm64;
      if (manifest.win?.x64) return manifest.win.x64;
      if (manifest.win?.setup) return manifest.win.setup;
    } else if (platform === "linux") {
      if (manifest.linux?.x64) return manifest.linux.x64;
    } else {
      const arch = detectMacArch();
      const url = manifest.mac?.[arch];
      if (url) return url;
    }
  } catch {
    // ignore — fall through to fallback
  }
  return GITHUB_RELEASES_LATEST_URL;
}
