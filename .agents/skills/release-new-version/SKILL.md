---
name: release-new-version
description: Use when the user says "发新版本", "release", "publish a new version", or wants to tag and ship a new Spherse release
---

# Release New Version

## Overview

分支驱动发版（不再用 tag 触发）：push 即发版，版本号唯一来源是 `packages/desktop/package.json`（写纯 `X.Y.Z`）。
CI（`.github/workflows/build-and-release.yml`）自动完成 verify 门禁、建包、上传、发版。

- push `dev` → beta 通道：`<base>-beta`，GitHub pre-release，只发包（不碰 `latest.json` / changelog / Pages）。
- push `main` → stable 通道：`<base>`，GitHub 正式版（latest），文案取仓库根 `Changes.md`。
- 本地指定版本：`DIST_VERSION=X.Y.Z npm run dist:alpha`（见 `scripts/sync-desktop-version.mjs`）。

## When to Use

- 用户说「发新版本」「release」「发布 v1.0.0」等指令
- 一个开发周期结束，准备发布新版本

## Steps

1. **确认版本号与文案**
   - `packages/desktop/package.json` 的 `version` 写纯版本号（如 `1.0.0`，无后缀）。
   - 发正式版：先手写根目录 `Changes.md`（当版内容，下次发版时重写）。

2. **确认工作区干净**
   ```bash
   git status --short
   ```
   如果有未提交的更改，提示用户先处理。

3. **推送对应分支即发版**
   - beta：合入 `dev` 后 `git push origin dev` → CI 出 `v<base>-beta` pre-release（同名旧 beta 自动删了重建，可反复推）。
   - 正式版：合入 `main` 后 `git push origin main` → CI 用 `Changes.md` 建 `v<base>` 正式版；`package.json` 带后缀会直接失败，`Changes.md` 缺失也会失败。

3b. **手动触发（Actions 开启后可用）**
   Actions 页 → Build & Release → Run workflow：选分支、选 `channel`（beta/stable）、可选填 `version`（空则取 `package.json`）。用于 Actions 刚开启时补发，或不推代码单独发一版。stable 同样要求纯版本号 + `Changes.md` 存在。

4. **确认 CI 触发**
   提示用户可在 GitHub Actions 页面查看构建进度。CI 会（beta 跳过 Pages）：
   - verify 门禁（ubuntu 上跑 `npm run verify`：lint + build + typecheck + 单测 + i18n；失败则不建 release、不打包）
   - 创建 GitHub Release（beta：`--prerelease --generate-notes`，可覆盖重建；stable：`--notes-file Changes.md`）
   - 构建 macOS arm64/intel DMG + Windows x64/arm64 EXE + Linux AppImage/deb
   - 打包产物冒烟验证（`e2e/packaged-smoke.spec.ts`，仅在 arch 匹配的 job 上执行：mac arm64 / win x64 / linux x64；启动 unpacked 二进制验证 renderer 挂载 + server `/health` + 版本号同步）
   - 上传到 GitHub Release
   - （仅 stable）触发 deploy-pages.yml 部署 web 版（landing + web）

## Key Knowledge

- **版本号约定**：`packages/desktop/package.json` 平时写纯 `X.Y.Z`（如 `1.0.0`）；`-alpha` 只出现在本地包（`dist:alpha` 自动补），`-beta` 只出现在 dev 通道的 CI 产物，正式版无后缀。发版前确认该字段已更新到目标版本。
- **不需要手动改其他 version**：CI 的版本同步步骤按发版通道设置 `packages/desktop` 的版本号；`package-lock.json` 由 `scripts/sync-desktop-version.mjs` 保持同步（本地）/ CI 内 `npm version` 处理。
- **beta 可反复推**：同名 beta release 会先删后建；stable 同名已存在则直接失败，防止误覆盖正式版。
- **beta 不污染 stable 通道**：beta 只发包；in-app 更新与下载页都读 GitHub Releases 的正式版（过滤预发布），beta 用户停留在 beta，直到正式版号超过它。
- **旧 tag 流程已下线**：不再用 `push tags: v*` 触发发版；`workflow_dispatch` 的 tag 输入仅保留给 OSS 重发布。

## Edge Cases

- **main 上 version 带后缀**：meta job 直接失败并提示改纯版本，不会发出带后缀的“正式版”。
- **main 缺 Changes.md**：meta job 直接失败，先补文件再推。
- **想重发 stable**：删掉同名 GitHub release 后重推 main（beta 才有自动覆盖，stable 故意不自动）。
- **分支被 worktree 占用**：checkout 失败时，提示用户切换到对应分支所在的工作目录执行。
- **tag 已存在**：beta 通道会自动清理重建；stable 通道报错，确认版本号无误后再处理。
