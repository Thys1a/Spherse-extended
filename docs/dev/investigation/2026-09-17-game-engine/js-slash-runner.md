# JS-Slash-Runner（酒馆助手 / Tavern Helper）调研

调研时间：2026-09-17
仓库：https://github.com/N0VI028/JS-Slash-Runner（1.2k stars / 88 forks，分支 main，约 2821 commits）
许可：Aladdin（自定义许可，复用前需法务确认；思路借鉴无碍）
文档：https://n0vi028.github.io/JS-Slash-Runner-Doc/

## 定位

SillyTavern 的多功能 JS 扩展：ST 默认不支持执行 JS，本扩展补上“对话内跑前端界面 + 深度操作系统 + 连外部应用”三件事。Vue + TS，`manifest.json`（`display_name 酒馆助手`，`version 4.9.5`，入口 `dist/index.js + dist/index.css`，`loading_order 100`，`auto_update true`，`minimum_client_version 1.12.13`），`src/{function,iframe,panel,slash_command,store,type,util}` + `macro.ts / swipe.ts`。

## 渲染器：在楼层消息里跑独立网页

ST 原生楼层渲染不支持 `<script>`。助手约定：**代码块包裹 + 含 `<body>` 标签**的消息块，转 **iframe 独立网页**渲染（支持 script、Vue、React，另有 `user-avatar / char-avatar` CSS 类与 `{{userAvatarPath}} / {{charAvatarPath}}` 宏注入头像）。配套开关：渲染深度（0=全渲染）、代码折叠、Blob URL 渲染（方便调试）、取消前端代码高亮（省性能）。触发方式是“代码块约定”，与 Spherse `HtmlCard`（tool 回传/文件驱动的同源 srcDoc）同构、入口不同。

## 变量系统：7 类

ST 原生仅 global/chat/extension 三类，助手扩展为 7 类（均支持路径取值与宏，类型定义见 `@types/function/variables.d.ts`）：

| 类型 | 绑定位置 | 宏示例 |
|---|---|---|
| global | 用户存档 | `{{get_global_variable::路径}}` |
| preset | 预设（随预设导出） | `{{get_preset_variable::路径}}` |
| character | 角色卡（随卡导出） | `{{get_character_variable::路径}}` |
| chat | 聊天文件（随聊天导出） | `{{get_chat_variable::路径}}` |
| message | 某楼层（`message_id`，负数=倒数，默认 latest；`{{format_message_variable}}` 始终反映最新楼） | `{{get_message_variable::路径}}` |
| script | 某脚本（随脚本导出，脚本内可省 ID） | — |
| extension | 用户存档，按扩展 ID 隔离 | — |

另有“注册变量结构”（zod schema，MVU 校验即用它）、变量管理器 UI、脚本库（全局脚本+ jQuery/Lodash 等内置库）。

## 其他 API 面

世界书/角色卡/预设/用户人设全套 CRUD；楼层消息获取/修改/创建/删除/渲染；酒馆正则管理；请求生成（含流式）与提示词注入；监听与发送事件（含酒馆内置事件、等待/一次性监听）；触发 QR 命令；音频播放器（BGM/音效）；访问酒馆原生接口与其他插件；socket.io 连外部应用。

## 安全警示（作者原文）

执行自定义 JS 可窃 API 密钥与聊天记录、破坏设置；来源不明脚本勿执行。这正是 Spherse 坚持 iframe 隔离 + host 侧 rate-limit / 白名单校验的同款理由（见 `docs/official/architecture/ui-sdk.md`）。
