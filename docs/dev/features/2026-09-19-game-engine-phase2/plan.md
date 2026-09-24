# Implementation Plan: 游戏引擎二期 + 追加需求 B1/B2/B3（game-engine-phase2）

- 日期：2026-09-19
- Design：`design.md`（同目录；代码实证 + 锁定决策 + 分域方案，本文不重复 rationale，只写 what/how/verify）
- 需求：一期 `docs/dev/features/2026-09-17-game-engine/design.md` §四 Phase 3 全集（R1.3/R1.4、R2.5b、R6.1/R6.3、R6.2 单独立项、E5 评估）+ 本目录 `design.md` 附录 B（B1 文本即渲染 / B2 首页修复 / B3 会话内查找）
- 范围：R1.3/R1.4 文档化、R2.5b 回滚执行器、R6.1/R6.3、R6.2 立项方向、E5 开工门槛检查、B1/B2/B3 全集。R6.2 实现、E5 实施（门槛未过则只留评估结论）不在本文。
- 模式：按依赖顺序执行，每 Task 独立可验证；完成即在标题行标注 `[x]`
- 顺序原则：B2 bug 优先 → 小项（B3、R1.3/R1.4、R6.1/R6.3）→ 中项（B1、R2.5b）→ 立项/评估（R6.2、E5）→ doc-sync + verify

## 任务依赖图

```
T1 B2 首页修复 ──────────────────────────────┐
T2 B3 查找搬移+接线 ─────────────────────────┤（T1/T2/T3/T6 无依赖，可并行）
T3 R1.3/R1.4 文档化 ─────────────────────────┤
T6 R6.1/R6.3 ────────────────────────────────┘
       │
T4 B1 开关+contracts+表单（跨包先行）─────────┐
       │                                      │（T4 可与 T1–T3 并行）
       ▼                                      │
T5 B1 合成渲染（依赖 T4；与 T6 同改 MessageItem，相邻排期）──┐
                                                             │
T7 R2.5b 回滚执行器（含 SDK 归因前置 + 遗留三件套归属）───────┤（中项，可与 T5 并行，
                                                             │ 建议单独排期）
T8 R6.2 单独立项（方向，依赖：无）───────────────────────────┘
T9 E5 开工门槛检查（依赖：E1–E2 验证结论；门槛未过只留评估）
       │
       ▼
T10 doc-sync + verify 全量（依赖：T1–T9 全部完成）
```

## 共享类型契约（各 Task 以此为准，勿自行变形）

```ts
// B1 开关（三处同名同义，默认关闭）
interface AgentProfile { allowInlineHtml?: boolean }            // core/src/types.ts:34 旁
agentProfile = Type.Object({ ..., allowInlineHtml: Type.Optional(Type.Boolean()) }) // contracts/src/agents.ts:29 旁
interface AgentFormData { allowInlineHtml: boolean }           // agent-markdown.ts:20-31 内（表单侧布尔，与 yolo 同例）

// B1 合成门控（MessageItem 内，useMemo 解析）
const shouldSynthesize = message.role === "assistant" && !message._streaming && allowInlineHtml === true;
// 合成卡 key：`syn-html-${messageId ?? "t"}-${blockIndex}`（作用域仅单消息内，blockIndex 已保证兄弟唯一，无需传 index；transient 行 _messageId 为空时用 "t" 常量）
// HtmlCard 只读：<HtmlCardRenderer card={synthetic} injectSdk={false} />（injectSdk 默认 true，现有行为不变）

// B2 白名单（tab-route.ts 新增纯函数，哑 projectId 复用 routeToTabSpec）
function isValidLastRouteSuffix(suffix: string): boolean;
// 合法形状：`/` ｜ `/chat/<非空无斜杠>` ｜ `/content?path=<非空>` ｜ `/browser?url=<loopback>`（先拆 `?` 再判）
// buildProjectRoute 非法输入 → 回 `/project/${projectId}`（空 suffix）

// B3 新家（可复用 UI 归属，file-tree/floating-frame/markdown-content 为先例）
import { FindBar } from "../../components/find-bar/FindBar";   // content-browser 与 chat 共同消费
// <FindBar containerRef={scrollContainerRef} contentKey={resetKey} onClose={...} />（bar 在滚动容器外）
```

- `set` 嵌套整替、version:2、`sp:` 三事件 payload 等一期契约沿用 `2026-09-17-game-engine/plan.md` 共享节，不在此重复。
- B1 与 R6.3 同改 `MessageItem.tsx`：以后合入者 rebase 为准，互不改对方语义（合成派生 vs 删除回填正交）。

---

## Task 1: B2 无标签页首页修复 [x]

**依赖**：无（bug 优先，最先合入）。

**改动文件**：
- `packages/app/src/features/tabs/TabContainer.tsx` [修改]：hooks 区（早于 `:109` return）加 effect——`!split && tabs.length===0` 时 `useTabStore.getState().openTab(projectId, { kind: "home", label: "" })`；`:109` 的 `return null` 保留。语义：空态必有 home；`closeAll`/关末 tab 后自动回 home（此前为空白）。
- `packages/app/src/features/tabs/tab-route.ts` [修改]：新增 `isValidLastRouteSuffix`（哑 projectId 复用 `routeToTabSpec:11-37`，先拆 `?` 再判；`/browser` 的 loopback 沿用 `isLoopbackUrl`）。
- `packages/app/src/features/activity-bar/use-project-actions.ts` [修改]：`buildProjectRoute:8-11` 调用白名单，非法回 `/`（`App.tsx:68` 冷启动恢复路径自动继承，共 4 处调用点）。**不查 session 存在性**（`TabPanel.tsx:41-44` 已自愈）。

**测试**（`packages/app`，仿既有组件/单测模式）：
- `TabContainer.test.tsx`：空态播种 home；`closeAll` 后回 home。
- `tab-route.test.ts`：`isValidLastRouteSuffix`（`/`、`/chat/s1`、`/content?path=` 空/非空、`/browser?url=` loopback/非 loopback、`/content` 无 query 非法）。
- `buildProjectRoute` 非法输入 → `/project/<id>`。

**验证**：`npm test --workspace=packages/app` 相关用例全绿。

---

## Task 2: B3 本会话内查找（搬移 + Chat 接线）[x]

**依赖**：无（可与 T1 并行）。

**改动文件**：
- [搬移] `packages/app/src/features/content-browser/FindBar.tsx` → `packages/app/src/components/find-bar/FindBar.tsx`；`hooks/useContentFind.ts`、`hooks/find-engine.ts` 随行；`EditFindReplaceBar` 留守原域。
- [改 import] `ContentView.tsx:12` 及 `FindBar.test.tsx`、`useContentFind.test.tsx` 的 import；`FindBar.tsx` 内 `useContentFind` 改 sibling 引用、`../../components/ui/*` 改 `../ui/*`。
- [改名] `data-content-findbar` → `data-find-bar`（含测试内 3 处查询）。
- `packages/app/src/features/chat/index.tsx` [修改]：`rootRef`（chat root div）+ `findOpen` 状态；Ctrl/Cmd+F handler（仅 `rootRef.current.contains(document.activeElement)` 时 `preventDefault + open`，照抄 `ContentView.tsx:143-153` 模式）；`ConnectionBanner` 与 `MessageList` 之间渲染 `<FindBar containerRef={containerRef} contentKey={sessionId} onClose={...}/>`（`containerRef` 为 `useChatScroll` 返回的 `data-chat-messages` 滚动容器）。
- i18n：复用 `content-browser.find.*` 6 键，**不新增**。

**测试**：
- content-browser 回归：既有 `ContentView.test.tsx:39-95` 全绿（行为零变化）。
- 新增 Chat 查找测试：焦点在 chat 内 Ctrl+F 打开 / 焦点在外不打开 / 计数显示 / next-prev 切换 / Esc 关闭清高亮。

**验证**：`npm test --workspace=packages/app` 相关用例全绿 + 手动验证两项已知行为（`design.md` 附录 B3：col-reverse 下 next/prev 为 DOM 序；流式中计数 stale 为 best-effort）。

---

## Task 3: R1.3/R1.4 纯文档化 [x]

**依赖**：无（可与 T1/T2 并行）。

**改动文件**：
- R1.3：`spherse-build-data-app/SKILL.md` [修改]（嵌套建模示例「队伍→成员数组→hp/level」+ `version:2` 升级规则 + `set` 整替措辞修正 `:62`“合并”矛盾 + 未知字段拒收 + `auto`/`match` 互斥）；`tools.ts:133-134` `mutate_data` 描述补嵌套/version/L1 字样。
- R1.4：skill + `mutate_data`/`write_file`/`edit_file` 工具描述 [修改]，声明三条旁路为“有意保留的演化通道”（`write_file`/`edit_file` 写 `.data.json` 场景加提示文案，不拦截，文案实施时定）。

**测试**：无行为变更单测（提示文案若落地则补单测）；`version:1` 含嵌套被拒回归跑既有 R1.1 用例。

**验证**：skill 示例可跟做检查 + `npm test --workspace=packages/core` 回归。

---

## Task 4: B1 开关 + contracts + 表单（跨包先行）[x]

**依赖**：无（可与 T1–T3 并行；T5 的前置）。

**改动文件**（顺序即拓扑序：core → contracts → app）：
- `packages/core/src/types.ts` [修改]：`AgentProfile:34` 旁加 `allowInlineHtml?: boolean`。
- `packages/core/src/store/agent-profile.ts` [修改]：`:121` 旁 parse（`data.allowInlineHtml === true || undefined`，与 yolo 同范式）。
- `packages/contracts/src/agents.ts` [修改]：`:29` 旁加 `allowInlineHtml: Type.Optional(Type.Boolean())`（`agentSummary` 不动）。
- `packages/app/src/features/agent-dialog/agent-markdown.ts` [修改]：`AgentFormData:20-31` 加 `allowInlineHtml: boolean` + 白名单解构 `:58` + parse `:72` 区 + build `:108-110` 区（`formData.allowInlineHtml` 真时写 `frontmatter.allowInlineHtml = true`）。
- `packages/app/src/features/agent-dialog/AgentDialogForm.tsx` [修改]：加**无门控**开关（仿 yolo `:194-200` 样式，不得包进 `hasAdvancedTool`）。
- i18n（走 i18n skill）：`agent-dialog.allowInlineHtmlLabel/Hint` ×3 locales。

**测试**：
- core：`agent-profile.test.ts` 仿 yolo 用例（`allowInlineHtml: true` 解析 / 缺省为 undefined）。
- contracts：profile 往返（含新字段可选通过）。
- `agent-markdown.test.ts`：含开关的双向序列化往返 + `extraFrontmatter` 不丢。

**验证**：`npm test --workspace=packages/core --workspace=packages/contracts --workspace=packages/app` 相关用例 + `check-i18n`。

---

## Task 5: B1 合成渲染（只读卡 + 围栏解析）[x]

**依赖**：T4（`profile?.allowInlineHtml` 透传链路）。

**改动文件**：
- `packages/app/src/features/chat/HtmlCard.tsx` [修改]：`HtmlCardRenderer` 加 `injectSdk?: boolean`（默认 true）；`false` 时跳过 `injectRuntime:77-96`（`__SPHERSE__` + postMessage 整体跳过；`renderIframe` 的 src/srcDoc 分支自动继承，expanded portal 同覆盖）。
- `packages/app/src/features/chat/lib/html-fence-parser.ts` [新增]：提 ` ```html ` 块 + 位置；未闭合容错（EOF 视作闭合）；`stripHtmlFences(content)` 剥离函数。
- `packages/app/src/features/chat/MessageItem.tsx` [修改]：`shouldSynthesize` 门控下 `useMemo` 解析；每块渲染 `<details>` 折叠源码（复用 `CodeBlock`）+ `<HtmlCardRenderer card={synthetic} injectSdk={false}/>`；key 按共享契约；传给 `MarkdownContent` 的 content 用剥离后文本；`message.content` 原值不动。
- `packages/app/src/features/chat/index.tsx` + `MessageList.tsx` [修改]：`profile?.allowInlineHtml` → `MessageList`（+`allowInlineHtml` prop）→ `MessageItem`。

**测试**：
- parser 单测：多块提取 + 位置保序 / 未闭合容错 / 非 html 围栏不提 / 大小写 `HTML`（实施时定是否接受并钉住）。
- 组件测试：非 assistant 不合成 / streaming 中不合成 / 开关关闭不合成 / 合成卡只读（无 runtime 注入）/ 剥离后无重复显示。

**验证**：`npm test --workspace=packages/app` 相关用例全绿。

**与 T6 协同**：同改 `MessageItem.tsx`，相邻排期、以后合入者 rebase；互不改对方语义。

---

## Task 6: R6.1 panic 锁定 + R6.3 删除回填 [x]

**依赖**：无（可与 T1–T4 并行；与 T5 同改 `MessageItem`，见上）。

**改动文件**：
- R6.1 `packages/app/src/features/chat/Composer.tsx` [修改]：`:369,411-419` 加 `disabled + 原因`（消费 historyError/reconnectFailed/`_withdrawError`/致命 error，实施时定最小集合）+ i18n；不动 reducer/WS。
- R6.3 `packages/app/src/features/chat/MessageItem.tsx` [修改]：`:264-287` 动作区加删除入口 + streaming-store 旁新 `deleteAiTurn`（删 assistant + 上一条 user，回填经现有 draft 键），与 withdraw/edit 互斥说明落盘（注释或 design 追记）。

**测试**：致命错误态禁用 + 原因组件测试；删除连带 + 回填单测 + 互斥说明检查。

**验证**：`npm test --workspace=packages/app` 相关用例 + i18n 检查。

---

## Task 7: R2.5b 回滚执行器 [x]

**依赖**：无（中项，建议单独排期；可与 T5/T6 并行开工，合入前跑全量回归）。

**改动文件**：
- `DataChangeEvent`/`CardChangeEvent` [修改]：加 before 镜像（字段名实施时定，contracts 同步）；store 落库时填 before。
- `server/src/routes/data.ts:96,113` [修改]：SDK `data.set/delete` 补归因透传（`sessionId/toolCallId`，否则回滚永远有漏网——前置条件）。
- 新增显式回滚指令（工具名与参数实施时定，推荐 `rollback_turn{sessionId, turnSeq}`）；`listSideEffectsByTurn`（T10 一期已落地，`session-manager.ts`）复用为回滚源；回滚本身走 `mutate` 幂等并产生新 `DataChangeEvent`（可再回滚）；并发冲突（ifVersion/sha256）拒绝转人工。
- skill + 用户可见说明 [修改]：仅 `data` + `card` 可回滚；`write/edit` 文件型、`memory`（无 delete）、`trigger`（已产生新 turn）为不可回滚类型。
- 遗留三件套归属（同批落定，不另开域）：同会话 trigger 可用性（排队 vs 跳过文档化）/ 早失败 turn-end 配对（synthetic seq vs 明确无配对）/ 并发 restore 竞态（排队提前到 switch 前）——决策记入 design §二追记。
- 不碰：fold 废弃语义、withdraw 截断路径（决策 6 冻结）、retry 对称行为。

**测试**：某 turn 写入后显式回滚、data/card 恢复 before（单测 + 端到端）；SDK 直写归因单测；ifVersion 冲突拒绝转人工单测；不可回滚类型声明检查；`listSideEffectsByTurn` 回归。

**验证**：`npm test --workspace=packages/core --workspace=packages/server` + contracts 契约测试。

---

## Task 8: R6.2 swipe 单独立项（本期只定方向）[x]

**依赖**：无。

**产出**：另立项文档（`docs/dev/features/<yyyy-MM-dd>-swipe/plan.md`），本期只锁定：分支带走 active 版、切换记新事件（append-only 相容，一期决策 9 沿用）；与 backlog 会话分支项（`backlog.md:58`）的关系在立项时定义；实现面（reducer + 持久化 + WS + UI）不在本期。

**验证**：立项接口方向检查（文档评审）。

---

## Task 9: E5 `chat.html` 整窗替换（开工门槛检查）[x]

**依赖**：E1–E2 验证结论（design §二决策 7）。

**产出二选一**：
- 门槛通过 → 另立项实施（contracts chat schema → server 路由/WS → `handlers/chat.*.ts` → `sdk/chat.ts` + `useSpherseChat()` → skill 声明；配额计入 300/min；降级回默认 `Chat`）。
- 门槛未过 → 本 Task 只留评估结论（缺什么、谁验证、何时重估），不写实现代码。

**验证**：开工时定（整窗端到端 + 降级三态 + 配额），或评估结论评审通过。

---

## Task 10: doc-sync + verify 全量 [x]

**依赖**：T1–T9 全部完成。

**改动文件**：按 doc-sync skill 逐项检查（`docs/official/` 域文件、package README、`project-structure.md` 登记 `src/components/find-bar/`、backlog 对账、i18n 检查）。

**验证**：`npm run verify`（lint → build → typecheck → test）；E2E 按影响面选跑（tabs/路由、chat/session/UI SDK 相关 spec；B1/B3 以组件测试为主）。

---

## 非目标（另立项，不在本文）

- R6.2 swipe 实现（T8 立项后另做）。
- E5 实施（T9 门槛未过则只留评估）。
- 会话分支（backlog 功能增强项，R6.2 立项时一并定关系）。
- B3 后续升级（多匹配高亮 + 跳过噪声区 + visual 序，动共享引擎，另立项并回归 content-browser）。
- B1 执行面扩大（更多围栏语言、流式中合成，不做）。
