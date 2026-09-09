---
name: spherse-embed-chat
description: 在聊天 HtmlCard 里嵌入实时聊天面板时使用：占位元素声明、布局尺寸、自动 dock、显式绑定后台会话、行为约定与排错
---

# 聊天卡片内嵌实时聊天面板

当 agent 生成的 HTML 需要"边看边聊"时——游戏里的 NPC 对话框、交互式教程的随问随答区、工作台里的助手侧栏——不要自己实现对话 UI：在页面里声明一个占位元素，App 会在它的位置上叠加一个**真实的聊天面板**（完整消息流 + 输入框，外观跟随 App 主题）。

仅**聊天 HtmlCard** 中生效；欢迎页与 Content Browser 预览没有会话上下文，不会 dock。

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

- 用 `<spherse-chat>` 或 `<div data-spherse-chat>`（二选一）；一页多个时只有第一个生效
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
- 同一卡片重复调用 `dockChat` 会切换面板中的会话
- 失败时 reject（`session_not_found` 等），成功 resolve；完整错误码见 `spherse-use-ui-sdk` 的 dockChat 一节
- 面板不需要了：`spherse.undockChat()`；占位元素被移出文档或页面卸载时自动关闭

## 行为约定（写页面时要知道的设计取舍）

- 面板外观跟随 App 主题，**页面 CSS 改不了面板样式**（面板渲染在 iframe 之外）
- 面板与主聊天是**同一会话的两种视图**：同一条消息两边都可见，两边都能发
- 面板位置被钳制在卡片区域内，不会溢出盖住 App 其它部分
- 面板内的消息流里如果还有同一张卡片，它的占位元素不会再 dock（防递归）
- 卡片被折叠（同 `file_path` 的旧卡片）时 iframe 不挂载，面板不会出现；展开后自动出现

## 排错

| 现象 | 检查 |
|------|------|
| 面板不出现 | 是否在聊天 HtmlCard 里（欢迎页/预览页无 runtime）；占位元素是否存在且有尺寸（`display:none` 或高度 0 都不行）；会话 ID 是否有效；卡片是否被折叠 |
| 面板卡在旧位置不动 | 占位元素被隐藏（`display:none`）但未移除——移除元素或恢复显示 |
| 面板位置/尺寸不对 | 占位元素的 CSS 盒模型；面板对齐占位元素的边框盒 |
| `dockChat` reject | 按错误码处理：`session_not_found` 换有效会话；`invalid_params` 检查参数；`dock_not_allowed` 说明在面板内的卡片里调用（不支持嵌套） |
| 面板里发消息没反应 | 与主聊天同规则：会话忙（`session_busy`）时稍后重试 |

API 参数细节见 `spherse-use-ui-sdk` skill 的「实时聊天面板嵌入」一节；HTML 落地约束（编码、滚动、CSP）见 `spherse-write-html`。
