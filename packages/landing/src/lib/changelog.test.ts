import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_API_REPO_URL } from "./urls";

const LIST_URL = `${GITHUB_API_REPO_URL}/releases?per_page=20`;

const apiReleases = [
  {
    tag_name: "v1.0.0",
    draft: false,
    prerelease: false,
    published_at: "2026-10-12T10:00:00Z",
    body: "## What's Changed\n* feat: something",
  },
  {
    tag_name: "v1.0.0-beta",
    draft: false,
    prerelease: true,
    published_at: "2026-10-11T10:00:00Z",
    body: "beta notes",
  },
];

async function loadChangelogModule() {
  return import("./changelog");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchChangelog", () => {
  it("fetches the GitHub releases list and filters out prereleases", async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (url !== LIST_URL) throw new Error(`unexpected url: ${String(url)}`);
      return { ok: true, json: async () => apiReleases };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchChangelog } = await loadChangelogModule();
    const result = await fetchChangelog();
    expect(result.releases).toEqual([
      {
        version: "1.0.0",
        tag: "v1.0.0",
        date: "2026-10-12",
        notes: [{ type: null, text: "## What's Changed\n* feat: something" }],
      },
    ]);
    expect(typeof result.generatedAt).toBe("string");
  });

  it("throws on http error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    const { fetchChangelog } = await loadChangelogModule();
    await expect(fetchChangelog()).rejects.toThrow("404");
  });

  it("throws when the fetch rejects (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { fetchChangelog } = await loadChangelogModule();
    await expect(fetchChangelog()).rejects.toThrow();
  });

  it("throws when the response body is not valid json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    const { fetchChangelog } = await loadChangelogModule();
    await expect(fetchChangelog()).rejects.toThrow();
  });
});
