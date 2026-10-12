import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_API_REPO_URL } from "./urls";

const API_URL = `${GITHUB_API_REPO_URL}/releases/latest`;
const FALLBACK_URL = "https://github.com/Thys1a/Spherse-extended/releases/latest";

const fullManifest = {
  version: "1.2.3",
  mac: { arm64: "https://m/mac-arm64.dmg", intel: "https://m/mac-intel.dmg" },
  win: { x64: "https://m/win-x64.exe", arm64: "https://m/win-arm64.exe" },
  linux: { x64: "https://m/spherse-x64.AppImage" },
};

function stubRelease(manifest: {
  mac?: { arm64?: string; intel?: string };
  win?: { x64?: string; arm64?: string };
  linux?: { x64?: string };
}) {
  const assets: Array<{ name: string; browser_download_url: string }> = [];
  if (manifest.mac?.arm64)
    assets.push({
      name: "Spherse-1.2.3-arm64.dmg",
      browser_download_url: manifest.mac.arm64,
    });
  if (manifest.mac?.intel)
    assets.push({
      name: "Spherse-1.2.3-intel.dmg",
      browser_download_url: manifest.mac.intel,
    });
  if (manifest.win?.x64)
    assets.push({
      name: "Spherse-Setup-1.2.3-x64.exe",
      browser_download_url: manifest.win.x64,
    });
  if (manifest.win?.arm64)
    assets.push({
      name: "Spherse-Setup-1.2.3-arm64.exe",
      browser_download_url: manifest.win.arm64,
    });
  if (manifest.linux?.x64)
    assets.push({
      name: "Spherse-1.2.3-x64.AppImage",
      browser_download_url: manifest.linux.x64,
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (url !== API_URL) throw new Error(`unexpected url: ${String(url)}`);
      return {
        ok: true,
        json: async () => ({
          tag_name: "v1.2.3",
          draft: false,
          prerelease: false,
          assets,
        }),
      };
    }),
  );
}

function stubReleaseHttpError() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
  );
}

function stubReleaseNetworkError() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
}

let originalUserAgentData: PropertyDescriptor | undefined;

function stubUserAgentData(value: unknown) {
  originalUserAgentData = Object.getOwnPropertyDescriptor(
    window.navigator,
    "userAgentData",
  );
  Object.defineProperty(window.navigator, "userAgentData", {
    value,
    configurable: true,
  });
}

function stubWinArch(architecture: string) {
  stubUserAgentData({
    getHighEntropyValues: async () => ({ architecture }),
  });
}

function stubWinArchProbeFailure() {
  stubUserAgentData({
    getHighEntropyValues: async () => {
      throw new Error("insecure context");
    },
  });
}

async function loadReleaseModule() {
  return import("./release");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalUserAgentData) {
    Object.defineProperty(
      window.navigator,
      "userAgentData",
      originalUserAgentData,
    );
  } else {
    Reflect.deleteProperty(window.navigator, "userAgentData");
  }
  originalUserAgentData = undefined;
});

describe("resolveDownloadUrl (windows arch selection)", () => {
  it("returns win.arm64 url for ARM64 devices when manifest provides it", async () => {
    stubRelease(fullManifest);
    stubWinArch("arm");
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe("https://m/win-arm64.exe");
  });

  it("returns win.x64 for x64 devices even when manifest has arm64", async () => {
    stubRelease(fullManifest);
    stubWinArch("x86");
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe("https://m/win-x64.exe");
  });

  it("defaults to win.x64 when userAgentData is unavailable (non-Chromium browsers)", async () => {
    stubRelease(fullManifest);
    stubUserAgentData(undefined);
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe("https://m/win-x64.exe");
  });

  it("defaults to win.x64 when the architecture probe rejects", async () => {
    stubRelease(fullManifest);
    stubWinArchProbeFailure();
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe("https://m/win-x64.exe");
  });

  it("falls back to the GitHub releases page when manifest win object has no usable url", async () => {
    stubRelease({ ...fullManifest, win: {} });
    stubWinArch("arm");
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe(FALLBACK_URL);
  });
});

describe("resolveDownloadUrl (fallbacks)", () => {
  it("returns the GitHub releases fallback when the manifest fetch fails", async () => {
    stubReleaseHttpError();
    stubWinArch("x86");
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe(FALLBACK_URL);
  });

  it("returns the GitHub releases fallback when the fetch rejects (network error)", async () => {
    stubReleaseNetworkError();
    stubWinArch("x86");
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("win")).resolves.toBe(FALLBACK_URL);
  });

  it("resolves mac downloads to the arm64 dmg when WebGL detection is unavailable", async () => {
    stubRelease(fullManifest);
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("mac")).resolves.toBe("https://m/mac-arm64.dmg");
  });
});

describe("resolveDownloadUrl (linux)", () => {
  it("returns the linux.x64 AppImage url when manifest provides it", async () => {
    stubRelease(fullManifest);
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("linux")).resolves.toBe("https://m/spherse-x64.AppImage");
  });

  it("falls back to the GitHub releases page for legacy manifests without a linux section", async () => {
    const { linux: _linux, ...legacyManifest } = fullManifest;
    stubRelease(legacyManifest);
    const { resolveDownloadUrl } = await loadReleaseModule();
    await expect(resolveDownloadUrl("linux")).resolves.toBe(FALLBACK_URL);
  });
});

describe("detectPlatform", () => {
  function stubNavigatorProps(props: { platform?: string; userAgent?: string }) {
    const originals = Object.entries(props).map(([key, value]) => {
      const desc = Object.getOwnPropertyDescriptor(window.navigator, key);
      Object.defineProperty(window.navigator, key, { value, configurable: true });
      return [key, desc] as const;
    });
    return () => {
      for (const [key, desc] of originals) {
        if (desc) {
          Object.defineProperty(window.navigator, key, desc);
        } else {
          Reflect.deleteProperty(window.navigator, key);
        }
      }
    };
  }

  it("detects linux via userAgentData platform", async () => {
    stubUserAgentData({ platform: "Linux" });
    const { detectPlatform } = await loadReleaseModule();
    expect(detectPlatform()).toBe("linux");
  });

  it("detects linux via the userAgent fallback when userAgentData is unavailable", async () => {
    stubUserAgentData(undefined);
    const restore = stubNavigatorProps({
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    });
    const { detectPlatform } = await loadReleaseModule();
    expect(detectPlatform()).toBe("linux");
    restore();
  });

  it("does not classify Android as linux", async () => {
    stubUserAgentData(undefined);
    const restore = stubNavigatorProps({
      platform: "Linux armv8l",
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    });
    const { detectPlatform } = await loadReleaseModule();
    expect(detectPlatform()).not.toBe("linux");
    restore();
  });
});
