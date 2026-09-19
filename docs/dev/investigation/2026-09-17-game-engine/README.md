# 游戏引擎方向调研总览

调研时间：2026-09-17
分支：`investigation/official-chat-bf76j`
目标：为聊天带来更多互动性，评估“高度定制聊天窗口”与“游戏引擎”两条线的可行思路。

## 文件索引

| 文件 | 对象 | 一句话 |
|---|---|---|
| `official-chat.md` | 幕间 official-chat（Gitea） | 自有 React 壳 + 私有 js-sdk；只能抄交互模式 |
| `sillytavern.md` | SillyTavern（33.5k stars，AGPL-3.0） | STscript 管道脚本 + Quick Replies 事件钩子 + WI |
| `js-slash-runner.md` | 酒馆助手 v4.9.5（Aladdin 许可） | iframe 渲染器 + 7 类变量 + 事件/世界书 API |
| `mvu.md` | MVU_Zod_StatusMenuBuilder（17 stars，AGPL） | 拖拽排状态菜单→schema+JSONPatch→Zod校验→重渲染窄闭环 |

许可红线：SillyTavern 与 MVU 系均为 AGPL-3.0，JS-Slash-Runner 为 Aladdin 自定义许可——四仓一律只学思路、不搬代码。

## 结论

1. 表现力上 Spherse 上限更高：Chromium renderer + `HtmlCard` iframe + `window.spherse` 双向桥，对齐 Tavern Helper 渲染器且多了 `chat.dock`、`data.mutate` 共入口 DataStore。
2. 聊天壳本身 Spherse 只能换主题（CSS），结构锁死（`features/chat/index.tsx:131`）；official-chat 因自有前端可任意改结构，不可比。
3. 做“游戏引擎”状态层已可用大半：`$manifest` mutations + `validateMutationArgs`（`packages/core/src/capabilities/data/validate.ts:27`）+ `mutate_data` 工具构成“schema 约束→校验拒绝→持久化”闭环（校验失败抛 `DataValidationError`、附 fields 明细、server 映射 400）。真正缺的是：①`fields` 仅 5 种标量、无嵌套 object/array（`manifest.ts:12-24`）②manifest 非法条目静默丢弃、无诊断（`manifest.ts:63,76`）③状态面板无常驻位。Spherse 上对应组装件仍是 `data.mutate（$manifest schema）+ HtmlCard`。
4. 脚本层（STscript/Quick Replies 语义：管道、分支、阻塞选择、聊天事件自动执行）是第二步。注意 trigger 系统已存在（`time` 定时 + `event` 显式 emit + 三种 session 模式），且 `sp:` 保留前缀已为内部事件预留但当前无人 emit（`packages/core/src/trigger/validation.ts:3`、`trigger-manager.ts:74` 直接丢弃）——这是“收到消息即触发”的现成接入点，前置缺口只是“turn 边界无人 emit 事件”。
5. 定制路线维持 official-chat.md 的 A/B 分档：A 补 `data-*` 钩子与声明式 Agent config；B 以 `chat.html` 经 iframe 链路替换整窗。不往主 renderer 注 JS。

## Spherse 映射与缺口

| MVU/ST 闭环环节 | Spherse 现状 | 缺口 |
|---|---|---|
| 结构化变量（chat 级持久化） | `data.*`（`.data.json` + `$manifest`）已成熟：queries/mutations、identity、auto uuid/nowIso、幂等 key、原子 RMW、乐观锁 | `fields` 仅标量，需嵌套 object/array 以建模队伍/背包（`manifest.ts:12-24`）；非法条目静默丢弃，需诊断 |
| AI 输出→解析→校验→写入 | **已有**：`validateMutationArgs` 抛 `DataValidationError`（附 fields 明细）、server 映射 400、skill `spherse-build-data-app` 承载建模 | 见上 |
| 状态 GUI | `HtmlCard` iframe 已对齐 | 面板无常驻位，随消息滚动消失 |
| 事件钩子（收 user/AI 消息触发） | trigger 系统已存在（`time`/`event` + 三种 session 模式）；`sp:` 保留前缀空转 | turn 边界 emit `sp:` 事件 + `TriggerManager` 放行（`trigger-manager.ts:74`） |
| 脚本管道（变量/分支/选择） | Composer slash + `>>` summon，无管道语义 | 脚本层（第二步） |
| 可视化 Builder | 主题有 skill，布局无 | 低优先级 |

下一步决策点：先做最小可用三件套（嵌套 schema + 回合事件 + 常驻面板），还是先抬主题天花板（A 档钩子与 config）。详见同目录 `requirements.md`。
