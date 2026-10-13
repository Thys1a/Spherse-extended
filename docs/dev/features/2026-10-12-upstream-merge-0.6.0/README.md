# 合并上游 v0.6.0

- 日期：2026-10-12
- 状态：已立项，待方案
- 版本：v1.0.1（新增项）
- 来源：上游 `mengrru/Spherse` v0.6.0（2026-10-11 发布）；本 fork README「未来计划」

## 范围

把上游 v0.6.0 的新能力按差异评估后合入本 fork。v0.6.0 主要内容：

- 欢迎页 tab 常驻标签栏首位、分窗 header「回到主窗口」按钮
- 移动端新建/删除/重命名 session 后桌面端列表不同步修复、冷启动卡死修复
- 文件树设备上传入口、UI 微调
- guide 补充快捷链接与全局搜索、settings 分区持久化与模型配置 server 化、模板市场 dialog、多标签页开关下放、memory guide 改写

## 关联

- 需逐项评估与本 fork 现有实现/未来计划的冲突（特别注意 settings server 化、模板市场与欢迎页 tab 部分）
- 上游 Release 页：`https://github.com/mengrru/Spherse/releases`

## 分析（2026-10-12，基线已拉取）

- 基线：共同祖先 `7efa2af`；上游 `v0.6.0`（`bab0634`）44 commits / 529 files（+28k/-12k）；本 fork同期 128 commits；**双边同改 141 files**
- 分支：`feat/upstream-merge-0.6.0-k7q2`（基于 `origin/dev`），`v0.6.0` tag 已 fetch 到本地，可直接 `git merge v0.6.0` 起手（先看下面策略再动手）

### 44 commits 按域归类

| 域 | 提交 |
|---|---|
| 标签页/窗口壳 | 内容区多标签 #104、内容分区 #106、欢迎页 tab 常驻 #141、分窗回到主窗口 #139、UI 微调 #143、标签栏高度修复 #108、content header 按钮位 #109 |
| 托盘 | 关闭至托盘 #107 |
| 市场/模板 | 项目市场 #103、onboarding 改市场并移除内置 sample #119、模板改 OSS 市场 dialog #146 |
| 记忆 | Agent 记忆（md + sqlite FTS5）#112、memory guide 改写 #148、landing 记忆卡片 #134 |
| 移动端/web | web dev 环境 #116、扫码连接 #117、ask 面板移动端 #120、manual 域名 403 #121、mobile 文件编辑 #131、web SDK 上传 #132、流式滚动 #133、长文本折行 #136、session 同步 #138、冷启动 #140、文件树上传 #142 |
| MCP/SDK/工具 | MCP hardening + SDK v2 + 去 sse #118、navigate 事件 #122、uploadFile #130、自定义 Header #124、骰子式工具调用折叠 #111、文件拖拽上传 #115 |
| 更新机制 | mac/Linux 更新日志弹窗 #126、Windows 应用内自动更新 #129 |
| 调试/杂项 | turn context 查看器 #125、草稿光标 #127、主题 #128、Tailscale 教程 #137、guide 快捷链接 #145、settings server 化 #144、多标签开关 #147、DeepSeek web_search #105 |
| 陪伴/沉浸 | 自定侧边面板 #113 |

### 冲突热点（双边同改文件数）

| 位置 | 双边同改 | 说明 |
|---|---|---|
| `packages/app/src` | 66 | 主战场：本 fork 做过 Entry/MessageGroup 聊天重构，上游加了 tabs/折叠/滚动/上传等；逐文件合 |
| `packages/core/src` | 12 | 记忆/触发/MCP 周边，对照 08/记忆方向决策取舍 |
| `packages/desktop/electron` | 11 | 含更新器（见下） |
| `docs/official/architecture` | 8 | 文档跟随改，低风险 |
| `packages/server/src` | 7 | session/路由层 |
| `packages/contracts/src` | 6 | 先合契约再合实现（仓库红线） |

### 必须保护的 fork 文件（合并时以本 fork 为准）

- `.github/workflows/build-and-release.yml`：上游改了 49 行（多为发版资产处理），但本 fork 已重写为分支驱动+去 OSS 流程——**整体保留本 fork 版**，只看是否需要捡上游的资产处理细节
- `packages/desktop/electron/updater.ts`（+测试）：上游重写了 222 行（Windows 自动更新 + 更新日志弹窗），本 fork 已切到 GitHub Releases 源——**保留本 fork 源切换**，上游的下载弹窗/自动更新能力单独评估是否移植
- `packages/desktop/package.json`（version `1.0.0` + fork homepage）、`electron-builder.yml`（fork publish 坐标）、`release-pipeline.test.ts`（新流程断言）
- `packages/landing/src/lib/{urls,release,changelog}.*`：上游没动这几个文件，无冲突；保持本 fork 的 GitHub API 版
- `Changes.md`、`scripts/sync-desktop-version.mjs`：本 fork 新增，上游没有，直接保留
- 注意：上游 `.agents/skills/release-new-version` 与本 fork 同名 skill 并存，合并后以本 fork 的分支驱动版为准

### 建议合并策略

1. 先合低风险：`docs/`（11+4+2+5）、`packages/i18n`、`packages/presets/skills`（4）、`templates`（2）、landing 非 lib 文件（15 中除 lib 外）
    > 文档先不要合并，等代码合并结束后再检查文档是否需要修改
2. 再合功能域（逐个 cherry-pick 或小步 merge，逐个跑对应单测）：托盘/标签页壳 → 移动端/web → MCP/SDK → 市场/模板（注意本 fork 已移除内置 sample 与 OSS，外链一律改本仓库）
3. 高风险最后：`app/src` 聊天区（66）、更新器下载弹窗/自动更新移植评估、settings server 化（与本 fork 设置体系对照）、Agent 记忆（与 08 方向决策对照：内核单系统，**不**引入第二套记忆）
4. 全程红线：发版流程、更新源、下载页数据源三处已切到本仓库，任何合入不得改回上游地址；`contracts` 先行
5. 步骤：逐域分析冲突-提供合并方案-用户审核后开始合并
