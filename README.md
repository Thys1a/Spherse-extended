<div align="center">

# Spherse Extended

中文｜[EN](README.en.md)

**一个本地运行、开箱即用的个人 Agent 运行时。**

> 本仓库是 [mengrru/Spherse](https://github.com/mengrru/Spherse) 的功能拓展 fork：保留上游全部能力，叠加下文「功能拓展」的新特性。上游原始说明见 [README_origin.md](README_origin.md)。License 与上游一致（MIT）。

让多个拥有独立身份、权限、技能和自动化能力的 Agent，围绕同一个用户数据空间工作；再用 HTML 与 UI SDK，把 Agent 和数据组合成真正可交互的应用。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="packages/landing/public/screenshots/screenshots-collage.png" alt="Spherse 应用截图" />

</div>

## Spherse 是什么？

Spherse 是一套让用户运行 Agent、管理本地数据并消费自制内容的基础设施。

在 Spherse 中：

- **项目目录是共享的数据空间**：普通文件就是用户的数据，始终保存在本地，可直接查看、编辑、复制和迁移。
- **Agent 是独立的执行者**：每个 Agent 都可以拥有自己的系统提示词、工具权限、私有 Skill、MCP Server、会话和聊天主题。
- **Session 是相互独立的任务上下文**：同一个 Agent 下可以创建多个会话，分别承载不同任务和历史。
- **Trigger 构成自动化网络**：Agent 可以按 Cron 定时运行，也可以响应自定义事件；用户页面或其他 Agent 都能发出事件。
- **HTML 是可运行的应用界面**：Spherse 可以直接托管并浏览项目中的 HTML，页面还能通过 UI SDK 读写数据、创建会话、发送消息和触发 Agent。

这使一个 Spherse 项目不只是一组聊天记录，而可以成为一个完整的 **Agent Workspace**：同时包含用户数据、Agent、Skill、自动化、主题和交互页面。

## 可以用它做什么？

Spherse 不预设唯一用途。一个项目可以是：

- 由多个角色持续维护的世界观与互动叙事空间
- 带仪表盘、日报和自动整理流程的个人记录系统
- 由研究、摘要和归档 Agent 协作的知识工作台
- 可通过事件联动的 AI 角色社区或文字游戏
- 用自定义 HTML 呈现的个人工具与数据应用

真正可复用和分发的单位不是一段 Prompt，而是包含 **数据结构 + Agent + Skill + 自动化 + UI** 的完整 Workspace。

## 功能拓展（本 fork 新增）

### 聊天

- **气泡右键**：复制选中文本，或以引用块插入输入框继续编辑发送。
- **会话内模型切换**：Composer 顶栏模型 pill，点击切换本会话持久模型；命令可带单次 override。
- **系统通知**：审批与 trigger 完成时推送。窗口失焦发 OS 通知，聚焦只走应用内 toast；最小化期间事件照常落盘，恢复不丢通知。
- **附件**：图片与文本类（txt/md/json）多附件发送，点击附件按钮选择文件。
- **编辑重发**：最后一个 user 消息可原地编辑后重新发送，编辑框自适应高度。
- **斜杠命令**：`/skill:` 调用 skill、`/command:` 调用项目级命令（支持 `$ARGUMENTS`/`$1..`/`@path` 展开），命令在左侧 Commands 面板管理。
- **召唤 Agent**：`>> <slug> <消息>` 把任务丢给另一个 Agent（fire-and-forget），当前会话留可跳转的召唤卡片。
- **桌宠模式**：浮窗收起为桌面小窗（形象圆 + 迷你输入框），会话右键「桌宠模式」进入，点击形象返回完整模式。
- **主题与滚动**：聊天主题按会话隔离、互不串色；历史滚动位置与贴底恢复。
- **HTML 嵌入实时聊天**：HTML 卡片里放一个聊天面板占位即可嵌入真聊天（流式/重试/审批可用），跟随 App 主题。

### 模型、语音与接入

- **Agent 默认模型**：每个 Agent 可单独选模型，不选跟随全局默认；会话内 pill 切换即持久到本会话。
- **TTS 朗读**：消息一键朗读，设置里可开自动朗读新回复（桌面端）。
- **自定义 Provider 请求头**：自建/网关 Provider 可配自定义 HTTP 请求头。
- **代理设置**：设置里配 HTTP 代理，模型请求走本地代理出站（桌面端）。

### 文件、标签与内容

- **文件左键单复用槽**：左键点文件复用当前内容标签（不再越点越多），中键/右键开新标签；聊天会话仍默认新标签。
- **标签管理**：标签右键关闭 / 关闭其他 / 关闭全部；左右分栏同时看两个文件。
- **Markdown**：大纲快速跳转、阅读态 checkbox 直接勾选落盘、编辑态搜索替换。
- **文件列表**：空白处右键、重命名、拖动移动、shift 多选批量删除。

## 内置 Skill

开箱即带 9 个 builtin skill（内存合并，随版本升级，不占项目磁盘）：

| Skill | 用途 |
| --- | --- |
| `spherse-guide` | 产品能力介绍与使用指引 |
| `spherse-write-html` | 写 HTML 前必读：数据读写与 App 能力调用约定 |
| `spherse-use-ui-sdk` | `window.spherse` SDK 调用参考 |
| `spherse-build-data-app` | 构建 HTML + Agent 共读写的数据型应用 |
| `spherse-embed-chat` | 在聊天 HtmlCard 里嵌入实时聊天面板 |
| `spherse-create-skill` | 自建 skill 的层级与格式规范 |
| `spherse-create-command` | 自建斜杠命令的文件格式与占位展开规则 |
| `spherse-create-ui-theme` | 项目级 UI 主题定制 |
| `spherse-create-agent-chat-theme` | Agent 聊天窗口主题定制 |

Skill 按 `Agent 私有 > .spherse/skills > .agents/skills > 内置` 合并，同名取最高优先级。源码在 `packages/presets/skills/`，自建 skill 放项目 `.spherse/skills/`（左侧 Skill 面板可视化管理）。

## 下载与安装

前往 [Releases](https://github.com/Thys1a/Spherse-extended/releases) 下载最新版本：

- **macOS**：下载对应架构的 `.dmg` 文件并拖入“应用程序”
- **Windows**：下载 `.exe` 安装包并运行
- **Linux**：下载 `.AppImage`（赋予可执行权限后运行）或 `.deb` 安装包

> [!NOTE]
> 当前 macOS 版本尚未使用 Apple Developer 证书签名。首次打开时如果出现“已损坏”或“无法验证开发者”提示，请在终端执行：
>
> ```bash
> xattr -cr /Applications/Spherse.app
> ```

> [!NOTE]
> Ubuntu 23.10 及以上版本默认限制非特权 user namespace，Linux 版首次启动时若报 SUID sandbox 相关错误，请先执行以下命令后重试：
>
> ```bash
> sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
> ```

安装后配置一个受支持的 LLM Provider API Key，即可创建项目和 Agent。

## 核心能力

### 多 Agent，共享同一个数据空间

围绕一个项目创建多个分工不同的 Agent。它们共享项目文件，但各自拥有独立配置：

- 系统提示词与预载上下文
- 可用工具及文件访问权限
- 项目级共享 Skill、Agent 私有 Skill 与内置 Skill
- 独立的 MCP Server 连接
- 多个持久化 Session
- 独立聊天主题

### 事件驱动的 Agent 自动化

Trigger 让 Agent 不必等待用户发起聊天：

- 使用 Cron 表达式定时执行
- 响应带 payload 的自定义事件
- 在新 Session 或指定 Session 中运行
- 由用户、HTML 页面或其他 Agent 触发
- 保存执行状态与运行日志

### 世界书与长期记忆

- 世界书：为 Agent 挂载 `.card.json` 角色书，命中关键词自动注入上下文；多 Agent 可外链共享同一份设定
- 长期记忆：Agent 用 `memory_save` / `memory_recall` 跨会话记住事实，并可用 `rollback_turn` 回滚某一轮的写入
- 结构化数据：`.data.json` 配合 manifest 做带校验的读写，关联的 HTML 卡片随变更即时刷新

### HTML + UI SDK：从内容到应用

Spherse 内置本地 HTTP Preview Server，可以直接浏览项目中的 HTML、图片和其他内容。用户页面可通过 UI SDK 调用运行时能力：

- `data.get` / `data.set` / `data.delete`：读写项目内 JSON 数据
- 创建 Agent Session
- 向指定 Session 发送消息
- 触发 Agent 自定义事件
- 打开项目文件或将内容显示为浮窗

由此可以形成完整闭环：

> Agent 生成或更新内容 → HTML 展示数据 → 用户交互 → 页面再次调用 Agent

### 整个 Workspace 都可以分发

Spherse 以项目目录作为完整的分发单元。复制或分享整个目录，其中的数据、Agent 配置、Skill、自动化规则、主题与交互页面都会一同保留。接收者在 Spherse 中打开后，得到的不是一份静态内容，而是一个可以直接运行、继续使用和自由扩展的 Agent Workspace。

### 本地优先，数据由用户掌控

- 项目内容以普通文件保存
- Agent 配置使用 Markdown、YAML 和 JSON
- Session 持久化在项目内的 SQLite 数据库
- AI 文件访问受路径分类与权限策略约束
- 文件工具具备路径穿越防护和并发写保护
- 危险操作需要用户明确批准

### 桌面运行，移动访问

Spherse 提供 macOS、Windows 和 Linux 桌面应用，也可以通过带访问令牌的 Web 客户端在移动设备上连接桌面运行时。Quick Tunnel 模式可自动建立 Cloudflare Tunnel，也支持用户自行配置公网入口。

## 版本更新

### v1.0.0（当前版本）

- 世界书自动注入与外链共享、Agent 长期记忆与 turn 回滚
- 结构化数据校验、触发器回合事件、上下文压缩与预算
- 斜杠命令与 Agent 召唤、附件、TTS、标签页窗口、移动端 PWA

## 未来计划

- 合并上游最新版本（v0.6.0）：设置 server 化、模板市场、欢迎页 tab 等，按差异评估后合入
- 世界书位置修正与注入扩容、Session 级配置、token 展示、状态数据外链
- 世界观撰写辅助、SDK 受限写、AI 输出解析、语言学习与信息卡运用、记忆增强
- trigger 跑脚本、软件内备份、Agent 圆桌、swipe 多候选

## 本地开发

环境要求：Node.js 22.19+。

```bash
git clone https://github.com/Thys1a/Spherse-extended.git
cd Spherse-extended
npm install
npm run dev
```

常用命令：

```bash
npm run build       # 构建所有 package
npm run verify      # lint、build、单元测试与 i18n 检查
npm run verify:e2e  # 完整检查 + Electron E2E
npm run dist        # 构建当前平台的安装包
```

项目采用 npm workspaces，主要由以下部分组成：

| Package | 职责 |
| --- | --- |
| `@spherse/core` | Agent、Session、Skill、Tool、Trigger 与本地数据运行时 |
| `@spherse/server` | Fastify HTTP/WebSocket API 与运行时契约 |
| `@spherse/app` | 桌面端与 Web 端共享的 React Renderer |
| `@spherse/desktop` | Electron 主进程、Preload、IPC 与桌面基础设施 |
| `@spherse/web` | 移动端 Web/PWA 宿主 |
| `@spherse/presets` | 内置模板与 Skill |
| `@spherse/i18n` | 国际化基础设施与翻译资源 |

详细架构与数据约定见 [`docs/official/`](docs/official/)，开发规范见 [`AGENTS.md`](AGENTS.md)。

## 技术栈

Electron · React · TypeScript · Fastify · pi-agent-core · pi-ai · MCP · SQLite · Zustand · Tailwind CSS

## License

[MIT](LICENSE)，上游项目见 [mengrru/Spherse](https://github.com/mengrru/Spherse)。
