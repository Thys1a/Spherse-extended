# plan：压缩结束小字横条（展开/收起）

- 对应设计：同目录 `design.md`（审查通过，待实施；toast 保留，横条为详情通道）

## 任务（按序，前者是后者的前置）

### 1. reducer 接自动路：`features/chat/model/entry-reducer.ts`＋`entry-state.ts`

`compaction_applied` 分支除推进游标外，另存 `{ applied: true, anchorSeq, excludedCount: excludedSeqs.length, digestSource? }` 进 `compactResult`（`entry-state.ts:21` 类型扩展可选字段）；旧 `compact_result` 路径不动。

- verify：`npm test --workspace=packages/app -- src/features/chat/model/entry-reducer.test.ts`（新增自动路写横条态、新压缩替换旧横条；`compact_result` 两态既有用例保留）。

### 2. 横条组件：`features/chat/CompactionBanner.tsx`（+ 测试）

与 `MessageList`/`Composer` 同级，收 `compactResult` + `sessionId` + `onDismiss`；首行小字（`chat.compactBannerTitle`，`{count}` 参数；`!applied` 用既有 `chat.compactNotNeeded` 文案）＋展开/收起/关闭按钮；i18n 新增 5 键三语同步；首次展开调 `api.getSessionEvents(agentId, sessionId)` 取最近 `compaction/applied` 的 `digestContent`，失败降级只显示条数行。

- verify：同上 workspace（新增横条渲染两种文案、展开懒加载 mock、失败降级、关闭回调）。

### 3. 接线：`features/chat/index.tsx`＋`runtime/session-store.ts`

`MessageList` 与 `QuickReplyBar`/`Composer` 之间渲染横条（`compactResult` 非空即显示，从未压缩不渲染）；toast effect **不再调 `clearCompactResult`**（手动路径双通道）；`×` 调 `clearCompactResult`（仅清本 session）。

- verify：`npm test --workspace=packages/app -- src/features/chat/runtime/session-store.test.ts`（只清本 session；新增 toast 后横条仍在的回归）+ `npm run check:i18n`。

### 4. 收尾门

- verify：`npm run lint`、`npm run build` 后 `npm run typecheck`、`npm test --workspace=packages/app`；合并前 `npm run verify:e2e`（按影响面选聊天相关 spec）。
- 验收：design §一逐项通过（手动/自动两路进横条、摘要懒加载、关闭语义、初始空态无横条、无 wire/contracts/server 改动）。
