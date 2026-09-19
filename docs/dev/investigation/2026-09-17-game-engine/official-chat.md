# official-chat 调研与聊天互动性/定制能力分析

调研时间：2026-09-17
调研对象：https://git.cheliz.me/mujian/official-chat（Gitea，`mujian/official-chat`，分支 main，最新 `0.10.0` 2026-07-22）
分支：`investigation/official-chat-bf76j`

## 结论

1. official-chat 是“幕间（Mujian）官方 Chat 应用”：自有前端，fork 后可任意改 React 结构；其聊天能力全部来自私有 `@mujian/js-sdk@0.0.6-beta.88`（`useChat` / `useMjEngine` / `Thread`），本仓库只是自定义皮肤层，不可整包复用，只能抄交互模式。
2. Spherse 的表现力上限更高：renderer 同样是 Chromium+React，且多了一层 official-chat 没有的东西——`HtmlCard` iframe + `window.spherse` 双向桥，可跑任意 HTML/CSS/JS 小应用。
3. 但聊天窗口壳本身，Spherse 目前确实只能换主题（CSS），做不到结构级定制：`packages/app/src/features/chat/index.tsx:131` 写死 `Header + MessageList + Composer`，Agent 只能注入 CSS 文本。
4. 推荐分两档：A（短期）抬高主题天花板——补 `data-*` 钩子 + 声明式 Agent config（如快捷回复/开场白）；B（中期）允许 Agent 带 `chat.html` 经现有 iframe 链路替换整窗，复用 UI SDK 的 `call/fire + postMessage` 模型。不推荐往主 renderer 注 JS（打破隔离与结构测试）。

## 1. official-chat 项目事实

- Gitea Template 仓，9 commits / 1 branch，版本串 `init(2025-11-25) → 2 → 0.4 → 0.4.0 → 0.6.0 → 0.6.1 → 0.6.1-patch-1 → 0.10.0`，README 仅一句话 `# 幕间官方Chat`。
- 技术栈（`package.json` 实测）：`vite@7.1.2 + react@19.1.1 + react-router@7.8.2`，UI 为 `@heroui/react@2.8.3 + tailwindcss@4.1.12 + motion`，状态 `zustand`（仅 global）、`ahooks` 节流，i18n 仅 `zh-CN / en-US`（`?lang=` 优先，fallback `zh-CN`）。
- 目录：`src/main.tsx → MujianProvider > ReactRouterProvider > Chat(/)`；`store/global.tsx` 并行拉 `project.getInfo() + persona.getActive()`；`pages/chat/` 下 `index / MessageList / MessageItem(+components) / MsgSend / QuickReply / PanicContext`；`utils/cls.ts` 的 `mjChatCls` 给所有 DOM 打 `mj-chat-*` 双类名供外部覆盖。
- 关键机制：`useChat({pageSize:20})` 提供消息收发/重生成/swipe/分页；发送前做 `{{user}}/{{char}}` 宏替换；`useMjEngine` 处理引擎事件；虚拟列表 `overscan=10 + keepMounted`；`column-reverse` 类贴底；`not_saved` 或 error 即 `panicked` 锁定输入；删 AI 消息连带删上一条 user 并回填输入框；`?insetTop=` 适配嵌入。

## 2. 与 Spherse 的能力对比

| | official-chat | Spherse |
|---|---|---|
| 聊天壳 | React，可 fork 任意改结构 | React，结构锁死，只开放 CSS 主题（`data-chat-root/bubble/composer` + 三级层叠，见 `docs/official/architecture/theming.md`） |
| 消息内容 | 文本/Markdown 气泡 | Markdown + `HtmlCard`：`content/file_path` 同源 srcDoc iframe，可做图表/表单/游戏/动画 |
| Agent↔页面双向 | 宏替换 + `useMjEngine` | `window.spherse` 桥：`sendMessage/createSession/data.mutate/card.*/events.on/chat.dock/chat.rect`，页面与 Agent 共用同一 DataStore（见 `docs/official/architecture/ui-sdk.md`） |
| 嵌入 | `insetTop` 避让 + 背景模糊 | `<spherse-chat>` 占位 + dock：真聊天面板叠进卡片指定位置 |

值得抄的都是小交互模式（每处约 50 行）：QuickReply 横向 Chip（wheel 转横滚 + 拖拽 + 50ms 误触阈值）、桌面 Enter 发送/移动端换行、panic 锁定、swipe 循环切换、滚动 `scrollHeight` 锚定。整包复用不可行：强耦合私有 js-sdk 的 `useChat/Thread`，装不过来，且与 Spherse 的 wire 协议（`contracts/websocket.ts`）、persist-before-callback、游标重放不兼容。

## 3. Spherse 聊天窗口定制现状与缺口

- 现状：三级主题层叠（App defaults → project `.spherse/theme.css` → agent `theme.css`，按 session 改写选择器隔离注入），开放约十余个 `data-*` 钩子，见 `packages/presets/skills/spherse-create-agent-chat-theme/SKILL.md`。
- 缺口：无布局插槽、无组件替换点、无聊天壳 JS 注入（agent theme 是纯 CSS 文本，经 `GET .../agents/:id/theme` 拉取注入 `<style>`）。`HtmlCard` 的丰富发生在消息流内，不是壳本身；`chat.dock` 是把原生 `Chat` 叠进卡片，壳仍是同一个。
- 约束来源：多 Agent 共用宿主 chat，为稳定性/安全/结构测试把壳锁死；改 DOM 钩子须同步模板 + 双 skill（`theming.md` 同步契约）。

## 4. 推荐方向

A. 短期（不动架构）：补 `data-*` 钩子（welcome 位、快捷回复条、swipe、附件栏）并同步 template + 双 skill；Agent config 加声明式扩展（开场白列表、快捷回复、placeholder、背景/遮罩参数）。覆盖 80%“看起来不一样”。
B. 中期（复用 UI SDK）：允许 Agent 带 `chat.html` 替换整窗，跑在 HtmlCard 同源 srcDoc iframe 里；host 新增 `chat.*` 只读+订阅族（`messages.list/subscribe/send/retry/withdraw` + runtime 上下文），SDK 封装 `useSpherseChat()`；缺失/报错/超时就地降级回默认 `Chat`；作用域沿用 project→agent 层叠；仅项目本地文件可声明。
不选：主 DOM 插槽/React 插件（一个崩全崩，还要版本化 contracts）；抽独立 `@spherse/chat-sdk` 供外部 fork（需先把 `features/chat` runtime/reducer/WS 解耦，等于重做 chat 重构，太远）。

下一步决策点：定制需求主要是气泡样式/背景/动画（A 即够），还是交互结构（Composer 换表单、消息流换时间线/地图，需 B）。
