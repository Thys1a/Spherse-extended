---
name: spherse-embed-chat
description: 在聊天 HtmlCard 里嵌入实时聊天面板时使用：占位元素声明、布局尺寸、自动 dock、显式绑定后台会话、行为约定与排错
---

# 聊天卡片内嵌实时聊天面板

当 agent 生成的 HTML 需要"边看边聊"时——游戏里的 NPC 对话框、交互式教程的随问随答区、工作台里的助手侧栏——不要自己实现对话 UI：在页面里声明一个占位元素，App 会在它的位置上叠加一个**真实的聊天面板**（完整消息流 + 输入框，外观跟随 App 主题）。

先决定面板里放哪个会话，再选接法：

| 面板里放 | 接法 |
|---|---|
| 当前会话（随问随答、工作台侧栏） | 靠自动 dock：声明占位元素即可，不写任何 JS |
| 别的会话（NPC 专属、后台任务） | 必须显式三步：`createSession` →（可选 `sendMessage` 预置）→ `dockChat({ sessionId })` |

## 在哪能 dock（三条路三种命）

| 页面 | SDK | 自动 dock | 显式 `dockChat({sessionId})` |
|---|---|---|---|
| `render_card` 出的聊天真卡片 | 有（App 注入） | ✅（绑定当前会话） | ✅ |
| 正文 ```html 围栏的内联预览 | **无**（注入被关闭，调 `spherse.*` 直接抛错） | ❌ | ❌ |
| Content Browser / 文件预览 | 有（preview server 注入） | ❌（无会话上下文，静默 no-op） | ✅（自备 sessionId 即可） |

想 dock 就让 agent 调 `render_card` 工具出卡，不要写正文围栏。

## 与其它会话能力的区别

| 需求 | 方案 |
|------|------|
| 在卡片位置直接对话 | 本 skill（占位元素 + 面板） |
| 点一下按钮发一句话给当前会话 | `spherse.sendMessage`（见 `spherse-use-ui-sdk`） |
| 跳转到某个会话页面 | `spherse.openSession` |
| 把会话弹成浮窗 | `spherse.floatSession` |
| 用户不可见的后台执行 | `createSession({ open: false })` + `sendMessage({ open: false })` |

## 最小可用示例

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <h1>森林小径</h1>
  <p>你遇到了守林人艾拉。她似乎有话要说。</p>

  <!-- 聊天面板会出现在这里：占位元素正常参与布局，用 CSS 控制大小 -->
  <spherse-chat style="display:block;height:320px;border:1px solid #ccc;border-radius:8px;"></spherse-chat>

  <!-- 不需要任何 JS：占位元素存在即自动 dock 当前会话 -->
</body>
</html>
```

要点：

- 用 `<spherse-chat>` 或 `<div data-spherse-chat>`（二选一）；同一张卡片内多个占位只有第一个生效（不同卡片各有各的面板）
- 占位元素必须有**非零尺寸**（空 div 默认高度为 0 → 给定 `height` 或 `min-height`）
- 面板尺寸/位置完全跟随占位元素的边框盒（margin 不计入）；页面滚动或尺寸变化时自动跟随
- 面板出现需要一次位置上报往返（毫秒级），卡片刚渲染时稍晚出现属正常

## 绑定其它会话（可选）

默认绑定当前会话。如需在卡片里展示另一个会话（例如后台创建的 NPC 专属会话），先创建再显式绑定：

```javascript
const { sessionId } = await spherse.createSession({ agentSlug: "ella-npc", open: false });
await spherse.sendMessage({ sessionId, message: "你是守林人艾拉，用第一人称简短打招呼", open: false });
await spherse.dockChat({ sessionId });
```

- `open: false` 全程不跳转、不浮窗，用户只在卡片面板里看到这个会话
- 注意：这条预置消息会以**用户消息**进历史（主聊天也能看到它、占上下文，每开新局都要来一次）。如果开场白不应留痕，不要用种子消息。
- 同一卡片重复调用 `dockChat` 会切换面板中的会话
- 失败时 reject（完整 5 个错误码见 `spherse-use-ui-sdk` 的 dockChat 一节）；无 slot / 无 session 时**静默 no-op**（不断言、不 reject，先自查占位元素与 `spherse.runtime`，见下节排错）
- 面板不需要了：`spherse.undockChat()`；占位元素被移出文档或页面卸载时自动关闭

## 行为约定（写页面时要知道的设计取舍）

- 面板外观跟随 App 主题，**页面 CSS 改不了面板样式**（面板渲染在 iframe 之外）
- 面板与主聊天是**同一会话的两种视图**：同一条消息两边都可见，两边都能发；`open: false` 只是不跳转，不是私聊
- 面板渲染在 iframe 之外的宿主文档（`position: fixed`），**页面内的 `z-index` 永远盖不住它**；能盖它的只有宿主层（如 pinned 浮窗）。想“藏”它：删占位元素 / `undockChat()` / 离开页面；想“不挡”：布局上给 slot 留好位置（面板精确覆盖 slot 边框盒）
- 面板位置被钳制在卡片区域内，不会溢出盖住 App 其它部分
- 面板内的消息流里如果还有同一张卡片，它的占位元素不会再 dock（防递归）
- 卡片被折叠（同 `file_path` 的旧卡片）时 iframe 不挂载，面板不会出现；展开后自动出现

## 排错

| 现象 | 检查 |
|------|------|
| 面板不出现，且没有任何报错 | 先按静默三件套查：① 是否在“三条路”表的可 dock 行（围栏预览/欢迎页本就没有）；② 占位元素是否存在且有尺寸（`display:none` 或高度 0 都不行）；③ `spherse.runtime.sessionId` 是否存在（自动 dock 的前提）。三者都对再查下两行 |
| 面板不出现（已排除静默），或有报错 | 自动 dock 是否在聊天 HtmlCard 里（欢迎页/预览页无 runtime）；会话 ID 是否有效；卡片是否被折叠；显式 `dockChat` 的 reject 按 `spherse-use-ui-sdk` 的完整错误码处理 |
| 面板卡在旧位置不动 | 占位元素被隐藏（`display:none`）但未移除——移除元素或恢复显示 |
| 面板位置/尺寸不对 | 占位元素的 CSS 盒模型；面板对齐占位元素的边框盒 |
| `dockChat` reject | 按 `spherse-use-ui-sdk` 的完整错误码处理（共 5 个；其中 `dock_not_allowed` 说明在面板内的卡片里调用，不支持嵌套） |
| 面板里发消息没反应 | 与主聊天同规则：会话忙（`session_busy`）时稍后重试 |

API 参数细节见 `spherse-use-ui-sdk` skill 的「实时聊天面板嵌入」一节；HTML 落地约束（编码、滚动、CSP）见 `spherse-write-html`。
