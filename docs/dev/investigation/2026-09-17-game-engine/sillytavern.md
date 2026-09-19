# SillyTavern 调研

调研时间：2026-09-17
仓库：https://github.com/SillyTavern/SillyTavern（33.5k stars / 6.3k forks，分支 `release`，约 11805 commits，300+ 贡献者）
许可：**AGPL-3.0，只能学思路，不能搬代码**

## 定位

本地安装的 LLM 前端（"LLM Frontend for Power Users"），2023-02 自 TavernAI 1.2.8 fork。统一对接多种 LLM API（Kobold/CPP、Horde、NovelAI、Ooba、OpenAI、OpenRouter、Claude、Mistral 等），另有移动端布局、Visual Novel 模式、A1111/ComfyUI 生图、TTS、WorldInfo（lorebook）、自动翻译。运行要求仅 Node.js 20+。结构：`server.js`（Node 后端）+ `public/`（前端）+ `default/` + `plugins/`。

## STscript：slash 命令脚本语言

权威文档：https://docs.sillytavern.app/usage/st-script。语法：`/` 命令 + `|` 管道串行 + `{{宏}}` + 变量。

- **变量**：local（存当前聊天 metadata）/ global（存 settings.json）；值可为 JSON 数组/对象（`/len`、`/getvar index=` 按下标/键读写，`/addvar` 支持 push）；作用域变量（闭包内 `/let /var`、`{{var::x}}`）。
- **流程控制**：`/if`（9 种比较规则 eq/neq/lt/gt/lte/gte/not/in/nin，支持 `{: 闭包 :}` 分支与 `/abort`）；`/while`（默认 100 轮 guard）、`/times N`（`{{timesIndex}}`）；`/break`；具名闭包（`/let 名 {:...:} | /:名`，可带默认参数）即过程定义；`/run` 可跨 Quick Reply preset 调用（`a.b` 语法）。
- **阻塞式 UI 命令**：`/popup`（lite HTML）、`/buttons labels=["a","b"]`（点击结果进管道）、`/input`（可配 large/wide/placeholder/tooltip/icon）、`/echo severity=`（toast）、`/beep`、`/loader-show/-hide/-wrap`。
- **LLM 控制**：`/gen /genraw`（lock/stop/instruct 参数）、`/trigger /swipe /regenerate /continue`、`/ask name=`（临时换角色）、`/inject id= position= depth=`（prompt 注入，chat metadata 持久化）、`/note /interval /depth /position`（Author's Note）。
- **消息读写**：`/send /sendas /sys /comment`（支持 `at=` 定位插入）、`/addswipe /hide /unhide`、`/cut /del /delswipe /delname /delchat`（危险操作）、`/messages` 范围读取（`{{lastMessageId}}`）。
- **WorldInfo 全套 CRUD**：`/getchatbook /findentry /getentryfield /setentryfield /createentry`，字段表覆盖 content/key/order/probability/depth/position/role/分组/过滤器等。
- **Quick Replies**：内置脚本库 + 自动执行（app 启动 / 收到 user 消息 / 收到 AI 消息 / 打开聊天 / 群成员触发 / WI Automation ID 触发），编辑器自带断点调试器（`/breakpoint`，可查变量/管道/单步）。

## 宏与扩展机制

- 宏：`{{getvar::x}} / {{setvar::x::v}} / {{roll::2d6+3}} / {{random::a::b}} / {{pipe}} / {{char}} / {{user}} / {{lastMessage}}` 等，`{{` 触发自动补全，新版有实验性 Macro Engine。
- 第三方扩展：`public/scripts/extensions/third-party/<name>/ + manifest.json`，可注册 slash 命令（`/help slash` 自动发现）与 UI。

## 可借鉴点

1. 管道批处理 + 闭包过程 + 自动执行钩子，是一套“无代码游戏逻辑”最小完备集。
2. `/buttons` 阻塞选择是 RPG 选项分支的最廉价实现。
3. WI 的 Automation ID 联动 QR，等于“lorebook 条目即事件源”。
