# 审计：game-engine 一二期 / native-float / swipe（2026-10-11）

> 方法：plan 勾选 × 代码 `grep` × `git log -S` 三方核对。只记完成/遗留判定与证据，不重复 design rationale。

## 一、game-engine 一期（`2026-09-17-game-engine`，plan T1–T16 全 `[x]`）

**结论：全部落地，无遗留。**

| 项 | 证据 |
|---|---|
| R1.1/R1.2 嵌套 schema + 诊断 | `manifest.ts` version:2、`validate.ts` 递归、`parseManifestWithDiagnostics`；合入 `58f8501` |
| R2.1–R2.4 回合事件 | `trigger-manager.ts:93 onInternalEvent`、`sp:` 订阅 fire 测试、`ws-bus` 外部伪造拒绝、TriggerForm 下拉、executor 深度计数 |
| R2.5a 归因 | `beforeToolCall` 映射 → `tool/result.sideEffects`；`session-manager.listSideEffectsByTurn` |
| R3.2 联动刷新 | `HtmlCard` + `FloatingContentBrowserContainer` 订阅 `file:update` |
| R4.1/R4.2 钩子 + config | `data-chat-*` 钩子、`AgentProfile` 新字段 + contracts + 表单 |
| R7.1–R7.3 世界书注入 | `card/worldbook.ts:33 matchWorldbook`、`:64 applyWorldbookBudget`、`:212 readAgentWorldbook` + card links（`2c4c013`） |

## 二、game-engine 二期（`2026-09-19-game-engine-phase2`，plan T1–T10 全 `[x]`）

| Task | 判定 | 证据 |
|---|---|---|
| T1 B2 首页修复 | ✅ 落地 | `TabContainer.tsx:91` 空态播种 home + `tab-route.ts:41 isValidLastRouteSuffix` + 测试（`210d6a6`） |
| T2 B3 会话内查找 | ✅ 落地 | `components/find-bar/` 搬移完成，chat 经 `index.tsx:249` 接线 |
| T3 R1.3/R1.4 文档化 | ✅ 落地（文档） | skill + 工具描述（plan 勾选 + T10 doc-sync） |
| T4 B1 开关 | ✅ 落地 | `allowInlineHtml`：core types → contracts → markdown → 表单 → i18n 三地 |
| T5 B1 合成渲染 | ✅ 落地（含重构位移） | `chat/lib/html-fence-parser.ts` + `AssistantBubble.tsx:148,157 injectSdk={false}`；原在 `MessageItem`，chat 重构后改由 `AssistantBubble` 承载，行为保留 |
| T6 R6.1 panic 锁定 | ✅ 落地（范围扩大） | `Composer.tsx:34,200,291 panicLocked`，由 `index.tsx:282` 按 `failed/fatal` 双态驱动；plan 只写 reconnectFailed，实施时扩大为双态 |
| T6 R6.3 删除回填 | ❌ **丢失** | 见下 |
| T7 R2.5b 回滚执行器 | ✅ 落地 | `rollback_turn`（`capabilities/rollback/tools.ts:35`）+ data/card `rollbackUndo` + server `routes/data.ts:80-120` 归因透传 + trigger 遗留三件套（`2e5307d`，executor 排队/合成 turn-end/按 session memo 可测） |
| T8 R6.2 swipe 立项 | ✅ 方向锁定，无实现 | 方向文档 `2026-09-23-swipe/plan.md`；代码零命中（见 §三） |
| T9 E5 | ✅ 评估结论（不开工） | 门槛未过；`chat.*` 五层链路零代码（sdk 仅 dock/rect，见 §四） |
| T10 doc-sync | ✅ | `cc2ecf3` |

### R6.3 丢失经过（重点）

- `66fef68` 落地 `streaming-store.deleteAiTurn`（withdraw 末轮 + `composer-insert-store` 回填、不重发）+ `index.tsx:115` 接线 + 单测。
- 上游 merge `9a9e9b6`（ADR-0014 chat refactor port）后树内零命中：`9a9e9b6^1` 有 5 处，`9a9e9b6` 本体 0 处；当前 `outbound-actions.ts` 只有 withdraw/edit，`MessageItem`/`AssistantBubble` 无删除入口。
- `git log -S` 未告警（merge 冲突消解的常规盲区）。plan T6 的 `[x]` 已过期，已在 plan 追记 + backlog 新增重落地项。

## 三、swipe（`2026-09-23-swipe`）

- 方向锁定 ✅：分支带走 active 版、切换记新事件（append-only 相容）。
- 实现 ❌：`packages` 下 `swipe` 代码零命中；4 个开放问题未关（分支事件名/payload、手势互斥、`hasMore` 下可见性、与 backlog 会话分支项的关系定义）。
- 去向：backlog 新增实现项，前置条件为先与「会话分支」项定关系（合并/复用/并行）。

## 四、native-float（`2026-09-19-native-float`，仅调研）

- design.md 首行已声明「只记调研结果，未立项、无方案锁定」；`setPermissionRequestHandler` / `showOpenFilePicker` / `alwaysOnTop` / 第二窗口代码零命中。
- 按要求拆分为两个独立 backlog 项（见下），原调研文档保留为依据，不改。

### 拆分之一：原生子窗口浮窗

现状：两浮窗域全是主窗口内 Portal overlay，`pinned` 只是 z-index，拖拽钳在窗口内。方向：Electron 原生子窗口（`parent: mainWindow` + `alwaysOnTop`）+ `http://localhost:{serverPort}` 承载；renderer 顶层浮窗路由上提；IPC 改多窗口；关闭策略；位置持久化复用 `byProject` store。

### 拆分之二：File System Access API 可用

现状：打包版 `file://` opaque origin、跨源 iframe、零权限放行三层拦截。方向：与子窗口同载体（localhost 安全上下文）；主进程 `setPermissionRequestHandler` 白名单放行；HtmlCard/srcDoc 另需 `allow-modals` 安全评估；简易浏览器内跨源页仍不可用（只能走顶层/子窗口打开）。

## 五、遗留清单（已同步 backlog）

1. R6.3 删除回填重落地（merge 丢失）。
2. swipe R6.2 实现（前置：与会话分支项定关系）。
3. 原生子窗口浮窗。
4. File System Access API 接通。
