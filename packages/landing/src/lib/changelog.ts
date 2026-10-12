import { GITHUB_API_REPO_URL } from "./urls";

export interface ChangelogNote {
  type: string | null;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  tag: string;
  date: string | null;
  notes: ChangelogNote[];
}

export interface Changelog {
  generatedAt: string;
  releases: ChangelogRelease[];
}

interface GithubReleaseItem {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  body?: unknown;
}

export async function fetchChangelog(): Promise<Changelog> {
  // 直接读本仓库的 GitHub Releases（取最近 20 条，过滤草稿与预发布；
  // 正文整体作为一条无类型笔记，UI 按中性样式渲染）。
  const res = await fetch(`${GITHUB_API_REPO_URL}/releases?per_page=20`);
  if (!res.ok) throw new Error(`GitHub releases responded ${res.status}`);
  const releases = (await res.json()) as GithubReleaseItem[];
  if (!Array.isArray(releases)) throw new Error("Unexpected releases payload");
  return {
    generatedAt: new Date().toISOString(),
    releases: releases
      .filter(
        (r) =>
          r.draft !== true &&
          r.prerelease !== true &&
          typeof r.tag_name === "string",
      )
      .map((r) => {
        const tag = r.tag_name as string;
        const date =
          typeof r.published_at === "string"
            ? r.published_at.slice(0, 10)
            : typeof r.created_at === "string"
              ? r.created_at.slice(0, 10)
              : null;
        const body = typeof r.body === "string" ? r.body.trim() : "";
        return {
          version: tag.replace(/^v/, ""),
          tag,
          date,
          notes: body ? [{ type: null, text: body }] : [],
        };
      }),
  };
}
