# Spherse Extended v1.0.0

首个正式大版本。本 fork 保留上游全部能力，叠加世界书与长期记忆、上下文工程、聊天与桌面移动体验等一系列功能拓展。

## 世界书与长期记忆

- 世界书自动注入：关键词/正则命中、constant 常驻、selective 组合条件、token + 条目双预算；`.card.json` 支持外链共享（Agent 对话框 + `manage_agent`）
- Agent 长期记忆：`memory_save` / `memory_recall` 跨会话记住事实；`rollback_turn` 一键回滚某一轮的数据与卡片写入
- 结构化数据：`.data.json` 嵌套 schema（version:2）、manifest 诊断、turn 级写入归因；关联 HTML 卡片随变更即时刷新

## 自动化

- 回合事件：`sp:user-message` / `sp:assistant-message` / `sp:turn-end` 可被触发器订阅，WS 防伪造，触发链深度防护

## 上下文工程

- 多轮压缩：发送前预检、截停自动续写、工具输出三层防御、手动压缩入口、历史工具输出收缩
- 检索防护：`search_content` 大文件跳过上报、单条/总量截断

## 聊天

- 斜杠命令（`/skill:`、`/command:`）与 Agent 召唤（`>>`）、消息编辑重发与撤回、panic 锁定
- HTML 内联渲染开关、会话内查找、按会话切换模型、附件、TTS 朗读、系统通知、桌宠模式

## 桌面与移动

- 标签页窗口、左右分栏、浮窗聊天与内容浮窗、快捷链接、内置浏览器
- 移动端 PWA（扫码连接 + Tunnel）、Linux 发行、代理设置、Agent 聊天主题、内置 Skill

## 升级说明

- 从任意 0.x 直接升级即可，数据目录结构兼容，新增 Agent 配置项均为可选
