# 状态数据外链 plan（2026-11-04）

依据 `design.md` 最终修订。已定：插入位置 A、无 enabled UI 开关、默认 `_state`、无预算上限（仅 token 提示）。

## Step 1 — core `capabilities/data/state-link.ts`（新建）→ verify：`state-link.test.ts` 全绿

- `assertDataLinkName` / `agentDataDir` / `linkTargetRealpath`：镜像 worldbook（`.data.json` 后缀、basename、无分隔符）。
- `addAgentDataLink(root, slug, target, {statePath?, label?})`：目标存在且为文件 → realpath 在项目内 → 同名 symlink 存在且同目标则幂等、否则 Conflict → 写 `$state`（显式传用之 / 已有合法保留 / 否则 `{path:"_state"}` 建空节点；label 覆盖；enabled 原样保留；节点缺失才落盘）→ temp+rename 到 **realpath** → 失效缓存 → 返回含 `estimatedTokens` 的 `AgentDataLink`。
- `removeAgentDataLink`：只删 symlink（400/404 对齐 card），不改目标文件。
- `listAgentDataLinks`：只列 symlink `*.data.json`（按名排序），普通文件忽略；`{name,target,dangling,hasState,statePath,estimatedTokens}`。
- `readAgentState` + mtime 指纹缓存（key `projectRoot\0slug`，目录 mtime + realpath `mtimeMs:size`）；`statsOfDataFile` 同规则单文件缓存。
- `readStateDeclaration(doc)`：读 `doc["$state"]`（非 `getRawByDotPath`），`path` 非空字符串、`label?` 字符串、`enabled?` 布尔。
- `renderStateBlock`：`<state file path label?>` + 2 空格 JSON，`file` 为目标项目相对路径，attr 经 `escapeXmlAttr`。
- `stateProjector`：单条 user 消息插到 `userSegmentIndex(messages,1)`。
- `data/index.ts` 导出新符号；core `src/index.ts` 只追加 server 跨包要用的三函数 + `AgentDataLink` 类型。

## Step 2 — 注册与隔离 → verify：core 相关测试全绿

- `data/capability.ts`：`contextProjectors: [stateProjector]`。
- `worldbook.ts`：`recentTextOf` 补剥离 `<state(\s[^>]*)?>…</state>`。`userSegmentIndex` 已抽至 `capabilities/shared/user-segments.ts`（能力目录互 import 禁止），`card/index` 保持 re-export 兼容。

## Step 3 — `tools/manage-agent.ts` → verify：`manage-agent.test.ts` 全绿

- `link_data` / `unlink_data`：参数 `path` + 可选 `state_path` / `label`；纳入 `isManageAgentWriteAction`。

## Step 4 — contracts + server → verify：server contract 测试全绿

- `contracts/src/agents.ts`：`dataLink` / `dataLinkListResponse` / `dataLinkAddRequest` / `dataLinkAddResponse` + 类型。
- `server/src/routes/agents.ts`：`GET|POST /:id/data-links`、`DELETE /:id/data-links/:name`，`parseContract`，校验交 core。

## Step 5 — app + i18n → verify：组件测试 + i18n 自洽检查全绿

- `AgentDataLinksField`（无 `statePath` 输入、无 `enabled` 开关）+ `AgentDialogForm` 挂载 + ApiClient 三方法；组件测试镜像 card。
- `agent-dialog.dataLinksLabel/Hint/Placeholder/Dangling/Tokens/Total/TotalWithRatio` 三地齐全，措辞「约 / est.」。

## Step 6 — 全量验证

`npm run lint` → `npm run build` → `npm run typecheck` → 各包测试；i18n check；不跑 E2E（未触 Electron 主进程）。

## Step 7 — 收尾

- amend design（如有偏差）→ commit → 派 code-review sub agent → 修 critical/important → doc-sync（`data-conventions.md`、`capabilities.md`、backlog 结清：symlink 替换风险、轮内冻结、 `$state:[]`、enabled 开关）→ 等用户验收（不自行 merge）。
