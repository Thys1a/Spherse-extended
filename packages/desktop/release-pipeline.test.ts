import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Release pipeline 结构测试。
 *
 * 发版流水线（build-and-release.yml）分支驱动：push dev 出 beta 预发布，
 * push main 出正式版；发版完成后联动触发 web 版部署
 * （deploy-pages.yml，GitHub Pages：landing + web）。
 * 这条链路最容易出现的回归是「静默失败」：
 * - 少了 `actions: write` 权限 → gh workflow run 直接 403，发版照常"成功"；
 * - dispatch 目标 deploy-pages.yml 丢了 workflow_dispatch 触发器 → 无法被触发；
 * - 条件写错 → beta 误刷 Pages，或 stable 漏触发。
 * 以上全部用 YAML 结构断言锁死。
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function loadWorkflow(name: string): Record<string, any> {
  return yaml.load(readFileSync(`${repoRoot}/.github/workflows/${name}`, "utf8")) as Record<
    string,
    any
  >;
}

const release = loadWorkflow("build-and-release.yml");
const pages = loadWorkflow("deploy-pages.yml");
const deployWeb = release.jobs["deploy-web"];

describe("build-and-release.yml: triggers (branch-driven + manual)", () => {
  it("triggers on dev/main branch pushes", () => {
    const triggers = release.on ?? release["on"] ?? release.true;
    expect(triggers.push?.branches).toEqual(["dev", "main"]);
  });

  it("offers a manual dispatch with channel/version inputs", () => {
    const triggers = release.on ?? release["on"] ?? release.true;
    const inputs = triggers.workflow_dispatch?.inputs ?? {};
    expect(inputs.channel?.type).toBe("choice");
    expect(inputs.channel?.options).toEqual(["beta", "stable"]);
    expect(inputs.version).toBeDefined();
  });
});

describe("build-and-release.yml: meta job resolves channel versions", () => {
  const meta = release.jobs["meta"];

  it("declares version/tag/prerelease/stable outputs", () => {
    expect(meta).toBeDefined();
    expect(meta.outputs?.version).toBeDefined();
    expect(meta.outputs?.tag).toBeDefined();
    expect(meta.outputs?.prerelease).toBeDefined();
    expect(meta.outputs?.stable).toBeDefined();
  });

  it("dev resolves to -beta prerelease, main requires plain version + Changes.md", () => {
    const run: string = meta.steps.find((s: any) => s.id === "ver")?.run ?? "";
    expect(run).toContain('"dev"');
    expect(run).toContain("-beta");
    expect(run).toContain("plain X.Y.Z");
    expect(run).toContain("Changes.md");
  });

  it("manual dispatch resolves channel/version from inputs", () => {
    const run: string = meta.steps.find((s: any) => s.id === "ver")?.run ?? "";
    expect(run).toContain("workflow_dispatch");
    expect(run).toContain("inputs.channel");
    expect(run).toContain("inputs.version");
  });
});

describe("build-and-release.yml: create-release job", () => {
  const createRelease = release.jobs["create-release"];

  it("beta deletes the previous same-tag release then creates a pre-release", () => {
    const steps: any[] = createRelease.steps ?? [];
    const del = steps.find((s: any) =>
      String(s.run ?? "").includes("gh release delete"),
    );
    expect(del).toBeDefined();
    const beta = steps.find((s: any) =>
      String(s.run ?? "").includes("--prerelease"),
    );
    expect(beta).toBeDefined();
  });

  it("stable creates the release from Changes.md without --prerelease", () => {
    const steps: any[] = createRelease.steps ?? [];
    const stable = steps.find((s: any) =>
      String(s.run ?? "").includes("--notes-file Changes.md"),
    );
    expect(stable).toBeDefined();
    expect(String(stable.run)).not.toContain("--prerelease");
  });
});

describe("build-and-release.yml: build job uses meta version (no tag parsing)", () => {
  const build = release.jobs["build"];

  it("maps meta version/tag into job env", () => {
    expect(build.env?.RELEASE_VERSION).toBe(
      "${{ needs.meta.outputs.version }}",
    );
    expect(build.env?.RELEASE_TAG).toBe("${{ needs.meta.outputs.tag }}");
  });

  it("syncs the app version from the env", () => {
    const sync = (build.steps ?? []).find((s: any) =>
      String(s.run ?? "").includes("npm version"),
    );
    expect(sync).toBeDefined();
    expect(String(sync.run)).toContain("$RELEASE_VERSION");
  });

  it("uploads reference the env tag, not GITHUB_REF_NAME", () => {
    const dump = JSON.stringify(build.steps ?? []);
    expect(dump).not.toContain("GITHUB_REF_NAME#v");
    expect(dump).toContain("$RELEASE_TAG");
  });
});

describe("build-and-release.yml: no OSS distribution", () => {
  it("has no publish-oss / publish-changelog jobs", () => {
    expect(release.jobs["publish-oss"]).toBeUndefined();
    expect(release.jobs["publish-changelog"]).toBeUndefined();
  });

  it("mentions no ossutil/OSS bucket", () => {
    expect(JSON.stringify(release)).not.toContain("ossutil");
    expect(JSON.stringify(release)).not.toContain("OSS_BUCKET");
  });
});

describe("build-and-release.yml: deploy-web job", () => {
  it("exists and needs meta + build", () => {
    expect(deployWeb).toBeDefined();
    expect(deployWeb.needs).toEqual(["meta", "build"]);
  });

  it("only triggers on stable push (beta never refreshes Pages)", () => {
    const condition: string = deployWeb.if;
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("needs.build.result == 'success'");
    expect(condition).toContain("needs.meta.outputs.stable == 'true'");
  });

  it("持有 actions: write 权限（GITHUB_TOKEN 级联 workflow_dispatch 的前提）", () => {
    const permissions = deployWeb.permissions;
    expect(permissions?.actions).toBe("write");
    // 只读 job 不需要 contents: write
    expect(permissions?.contents).toBe("read");
  });

  it("用 gh CLI 触发 deploy-pages.yml，ref 指向分支且 include_web=true", () => {
    const step = deployWeb.steps.find((s: any) => String(s.run ?? "").includes("gh workflow run"));
    expect(step).toBeDefined();

    const run: string = step.run.replace(/\\\n/g, " ").replace(/\n/g, " ");
    expect(run).toContain("deploy-pages.yml");
    expect(run).toContain('--ref "${GITHUB_REF_NAME}"');
    expect(run).toContain("-f include_web=true");

    expect(step.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });
});

describe("deploy-pages.yml: dispatch 目标可达", () => {
  it("声明了 workflow_dispatch 触发器，可被发版流水线触发", () => {
    // js-yaml v4 遵循 YAML 1.2 core schema，`on` 保持字符串 key
    const triggers = pages.on ?? pages["on"] ?? pages.true;
    expect(triggers).toBeDefined();
    expect(triggers.workflow_dispatch).toBeDefined();
  });
});

describe("deploy-pages.yml: web 仅随发版部署", () => {
  const triggers = pages.on ?? pages["on"] ?? pages.true;

  it("main push 路径触发不含 packages/web（web 变更不触发 Pages 部署）", () => {
    const paths: string[] = triggers.push.branches && Array.isArray(triggers.push.paths)
      ? triggers.push.paths
      : [];
    expect(paths).not.toContain("packages/web/**");
  });

  it("include_web input 默认 false（手动 dispatch 默认只部署 landing）", () => {
    const input = triggers.workflow_dispatch?.inputs?.include_web;
    expect(input?.type).toBe("boolean");
    expect(String(input?.default)).toBe("false");
  });

  it("web 构建/版本同步步骤以 include_web 为条件", () => {
    const conditionalSteps = pages.jobs.deploy.steps.filter((s: any) =>
      s.if?.includes("inputs.include_web"),
    );
    expect(conditionalSteps.length).toBeGreaterThanOrEqual(2);
  });

  it("landing-only 部署保留已部署文件（keep_files: true），发版部署全量替换", () => {
    const deploy = pages.jobs.deploy.steps.find((s: any) => s.uses?.startsWith("peaceiris/actions-gh-pages"));
    const keep = String(deploy.with?.keep_files).trim();
    // push（无 input 上下文）→ true；dispatch include_web=true → false
    expect(keep).toBe("${{ github.event_name != 'workflow_dispatch' || !inputs.include_web }}");
  });
});
