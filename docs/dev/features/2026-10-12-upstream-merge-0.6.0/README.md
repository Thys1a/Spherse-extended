# 合并上游 v0.6.0

- 日期：2026-10-12
- 状态：合并中，剩余 10 项（见文末待办）
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
| 调试/杂项 | turn context 查看器 #123、草稿光标 #127、主题 #128、Tailscale 教程 #137、guide 快捷链接 #145、settings server 化 #144、多标签开关 #147、DeepSeek web_search #105 |
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
    > 拉取上游记忆相关的实现和决策以判断是否采纳
4. 全程红线：发版流程、更新源、下载页数据源三处已切到本仓库，任何合入不得改回上游地址；`contracts` 先行
5. 步骤：逐域分析冲突-提供合并方案-用户审核后开始合并

- 提交 d55aa12：landing 记忆功能卡片（文案按 fork 实际改写）+ 删 worldbook coming-soon（upcoming 只剩 roundtable）+ 三语同步
- 提交 e815469：server.ts 两行对调 + 3 个用例（开关无关注册、切模式摘除、换域名替换），docs 已按规则剥离
- 提交 5d33be7：只含 theme-settings/index.tsx 三行（min-w-0 + wrap="off" + field-sizing-fixed overflow-x-auto）；同提交的两处 skill 文档按规则剥离未合入
- 提交 6595d75：TabStrip.tsx 移植（home 固定 + data-tab-scroll 滚动区 + id 化拖拽，跨区 no-op）+ 3 个分区用例；skill/docs 按规则剥离
- 提交 3b93a82：DeepSeek web_search 工具，backlog hunk、design.md 新文件、official×4、guide SKILL 全部还原，只留代码+测试（与方案一致，上游 22 文件 → 合入 15 个）。
- 095acf5 不默认使用：assistant.md 去掉 web_search，presets.test.ts 期望同步。
- c7662c4 解耦 A（core）：WebSearchBackend { baseUrl, model, apiKeyEnv } 经 deps 注入，defaultWebSearchBackend() 读 SPHERSE_WEB_SEARCH_* env（默认仍指向 DeepSeek 地址/模型，但只是默认值）；readDeepSeekApiKey 改为通用 readWebSearchApiKey；catalog.ts 删 providerEnvKey（唯一消费者消失）；缺 key 报错去 vendor 名。
- 7f3d862 解耦 B（设置独立）：AppSettings/HostSettings 新增 webSearch { apiKey, baseUrl, model }；desktop 落 SPHERSE_WEB_SEARCH_* env、掩码读写沿用 **** 惯例；app 通用页新增面板（key 用 password 框，不做 capability 门禁，web 宿主 localStorage 透传）；i18n 新增 settings.webSearch.* 三语、tool.web_search_hint 三语去 DeepSeek 化；plan 落盘 docs/dev/features/2026-10-13-web-search-decoupling/plan.md。
- 提交 e2addcd fix: merge upstream tab height overflow and dev tray default (5e6e283)，3 文件（上游 5 文件 − desktop.md 剥离 − e2e spec 跳过）。
- 提交：内容区分窗（9abf029，#107）。bcfaf92（拆分取）+ f97a326（修复）+ 63cbba3（吸收）
- 109 结论：零产品差异，无需合入。fork 的 split 按钮本就在文本按钮（Preview/Source/Edit）之前，与上游修完的顺序一致。转成移植了一条顺序断言
- 提交 711bf46 feat: merge upstream split return-to-main button (23418e7)，8 文件（+91/-2）。
- 提交 e49261f fix: merge upstream cross-client session list sync (49bf1db)，17 文件（上游 20 − design.md − official×4 + 回补 1 个测试断言文件计数差）。
- 提交 59f288f fix: merge upstream mobile cold-start fallback to connect page (f4d172b)，8 文件（上游 11 − backlog − design.md − frontend.md）。
- 跳过 #147 多标签开关下放：本 fork 无 `tabsEnabled` 设置项（标签页由自有 feature flag + TabStrip 架构控制，与此前各域剔除口径一致），无法移植。
- #147 版本显示已随 #103 就绪（全局 API 工厂面已合入，原记“待 #117”有误），待排期移植：`HostBridge.getAppVersion` + `useGlobalApiClient` + `UpdateChecker` 改写 + `desktopVersion` 三语。
- 暂缓 #111：`assembleGroups` 两边按不同架构重写（fork 用 bubblesByEntryId+owner 合并，上游用 entries+fold 气泡），`AssistantBubble.tools` 存废方向相反，机械合入不可行；待聊天区收敛后单立 design doc（ThoughtBlock/ToolCards 组件可直接取，只需重写 model 层）。
- 跳过 #124：fork 已有等价且更强的自研实现（结构化行编辑器 + fetch 层透传），上游 7 个 wire 级测试在未改代码下全绿，无缺口。
- dbc3304：#115 拖拽上传 + #130 SDK action + #132 web 开放 + #142 右键入口，按依赖顺序叠入
- 提交 b807024 feat: merge upstream web dev environment and dev deploy (975f010)，7 文件（上游 12 − design.md − official×4）。
- 提交 f12080f feat: merge upstream mobile connect UX, scan plus payload plus disconnect (a76c3e3)，20 文件（上游 24 − design.md − plan.md − official×2）
- 提交 9f7cf43 feat: merge upstream mobile file editing and dialog host gating (3fb6cf8)，3 文件（+45/-14，上游 5 − backlog − frontend.md）。
- 提交 aa8faa7 feat: merge upstream sdk navigate event and search fix (f5004e6)，17 文件（上游 20 − design.md − ui-sdk.md − project-structure.md）。
- 468bbd9（#127，3 文件全自动合入，28 用例过）+ a4675a0（#145 快捷链接文档，11+/3-，全局搜索/管理参数按核实剔除）
- 域二十合入完成（4f05fea，30 文件）。
- 域二十一合入完成（8547002，32 文件）。
- 域二十二合入完成（0bfd859，31 文件）。执行情况：contracts/server/路由/测试、对话框新旧替换、分类改道、presets 生成管线直取；i18n 取 dialog 键并删 picker 死键；手合 6 处（api import+4 方法、contracts صادرات、README 1 行、测试 mock 并集）。另修正两处：上游 GlobalApiClient 里附带的 settings 方法 fork 无契约已剔除；createDataStore 导出误删一次已补回（教训：并集改完 grep 导出名）。
- 提交 d991541：上游 938b1a5 全链（contracts schema → core search → server 路由 → app dialog/locate/route-params → i18n 三语），41 文件。fork 差异保留：自有 tab 系统、nav-history 内联逻辑 + strip、e2e 延期。验证：build/typecheck 全过、lint 0 error、check:i18n 过；core 1568、server 404、contracts 98、app chat 513 全绿（core mcp、server fs-watcher 各 1 个失败，经查与本合并无 import 链，为预存 flake/env 问题）。
- 提交 3478eb9：d991541 的 review 修复（tab-sync/messageId 竞态、C1；真实贯通契约测试替代 mock；searchMessages 排除 compaction 折叠；PM limit 钳制；useLocateMessage seen-then-gone 终局），9 文件。
- #113 合并完成，三笔提交已落盘。040c1cd 合并本体（33 文件）：core（ProjectConfig.sidePanel + 共享校验 + PM 门面）→ contracts（request/response schema）→ server（GET/PUT 两条路由）→ app（CustomSidePanel 自治组件 + query/store/bridge + 设置 dialog + ActivityBar 菜单/dialog + ProjectPanel 包裹 + lifecycle 级联）→ i18n 三语 14 key。fork 差异保留：lifecycle/bridges 内上游旧 tab 名全部弃用、CommandPanel 留在包裹内、ContextMenu 保留、docs 全剥离。
- #135（78057b4，3 skill 文件全自动合入，14/4/8 与上游一致）+#137（c2ab3ee，landing 三语 md 文档子系统 + Tailscale 教程）批量合入：剥离 project-structure 与 lock 噪音；手合 Header（保留 explore 回退块）与 landing i18n（保留 cases.backHome，删 docs.construction）；landing README 新文件去上游自定义域名；package.json 加 react-markdown/remark-gfm 后 npm install 重建 lock；验证 landing build/typecheck/test/lint 全过，presets 生成物重建后测试过。

## 待办（8 项未合入）

- 高风险最后：#112 Agent 记忆、#148 memory guide 改写（对照 08 记忆方向决策）、#144 settings server 化
- 待分析：#104 内容区多标签（fork 自研 tab 架构，机械合入不可行，leave-guard 等单点价值待评估）、#123 turn context 查看器（fork 只有旧 turn-context 端点）
- 待评估：#126 mac/Linux 更新日志弹窗、#129 Windows 应用内自动更新（updater 受保护文件，fork 已切 GitHub Releases 源）