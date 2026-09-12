# 聊天新功能群执行计划

对照 `design.md`。批次 A/B/C/D 相互独立可并行；E 紧跟 D；F 的 meta 扩展是 G 的前置；H 可随时并行。每批次收尾跑 `npm run verify`（lint/build/typecheck/test）+ 受影响 chat E2E；新增 store/导出面同步 structure 测试与 `project-structure.md`。

## 批次 A — #5 右键复制/引用（纯 app）

1. bubble 容器加 `onContextMenu`：选区非空且落在当前 bubble → 自绘 ContextMenu（复制 / 引用到当前会话）；desktop `setupContextMenu` 不动。
2. 给 Composer 新增外部插入接口（光标处插入 + 聚焦）；引用以 `` ```quoted `` md 代码块插入。
3. i18n（zh-CN 基准）+ 组件测试（选区/菜单/插入）。
4. 验证：`npm test --workspace=packages/app`，typecheck + lint。

## 批次 B — #3 会话模型（core + contracts + server + app）

1. contracts：`SessionInfo` 加 `model?`；`PATCH .../sessions/:id/model` body `{modelId}`。
2. core：`sessions` 表加 `model` 列（ALTER TABLE 迁移）；`SessionManager` per-session map + 落库 + `setSessionModel`；`buildAgent` 初始化/`restore`、`getSessionStatus` 改读 `session > profile.model > global`；`ensureModel` 加一次性 override 入参（供 F）。
3. server：`routes/sessions.ts` 加路由（`ModelCatalog.resolveModelById` 校验）。
4. app：Composer 顶栏模型 pill + 下拉（provider catalog），切换调 API。
5. 验证：core session 契约测试、server sessions 测试、app 组件测试。

## 批次 C — #8 通知（app + host 双壳）

1. `host-bridge.ts`：`notify(title, body)` + `HostCapabilities.notification` + `system-notification` 特性门；`HostSettings.notifications: {approval, trigger}`。
2. renderer：`ApprovalNoticeBridge`（叠加窗口失焦判定）与 `TriggerEventBridge` 的 `trigger_completed` 分支并行调 `notify`。
3. desktop：主进程 `new Notification().show()`，点击聚焦 + 跳转会话；已聚焦只 toast；Windows `setAppUserModelId`。web：`Notification.requestPermission()`，前台 toast 后台 OS 通知。
4. Settings 两个开关 + i18n。验证：host-bridge 测试 + 双壳手动验证。

## 批次 D — #1 附件（全链路；E 的前置）

1. core：`TextAttachmentProcessor`（§9 三档预算：默认 16KB / 8KB / 32KB，单轮 64KB 帽）注册到 `attachmentCapability`。
2. server：`attachments.ts` 白名单 + 分级上限（图片 5MB / 文本 2MB）+ PDF 400；`preview.ts` 文本放行；新增 download 路由。
3. app：`sendMessage` 全链改 `attachments[]`；Composer `accept="*"` + `AttachedFile[]`；AttachmentBar 文件行；MessageAttachments 下载链接。
4. 验证：contracts/server 附件测试扩用例、app 组件测试。

## 批次 E — #6 编辑重发（依赖 D）

1. `streaming-store` 加 per-session `pendingEditResend`；`turn_withdrawn` 后发送、失败丢弃。
2. user 气泡编辑入口（withdrawable 同条件）+ 原地 textarea。
3. 验证：reducer/store 单测（含 withdraw 失败丢弃 intent）。

## 批次 F — meta 扩展 + #2 斜杠命令

1. 事件扩展（一次改动，供 G 复用）：`user/message` data 加 `slashMeta`；同步 `fold.ts`、contracts、`chat-wire-projector`、reducer pill 渲染。
2. core：`CommandStore`（项目级 `.spherse/commands/`）+ `SlashResolver` 纯函数 + 展开器（`$ARGUMENTS`/`$1..`/`@path`，缺参数 ValidationError），挂 `AgentRunner.sendMessage` 前；`model` 走 B 的单次 override。
3. contracts + server：`CommandDefinition`、CRUD + resolve 路由。
4. app：Composer `/` 补全下拉 + 未知 toast；左侧 Commands 管理面板（textarea 编辑）。
5. 验证：resolver 单测、command 契约测试、补全组件测试。

## 批次 G — #4 `>>` 召唤（依赖 F）

1. server `ws-chat` message 分支拦截 `^>>`（不启动当前 run）；`SessionPort.createSession('new') + sendMessage` 后返回。
2. 当前会话落 `source: "summon"` 事件（F 的扩展），reducer 渲染跳转卡片。
3. app：Composer `>>` agent 补全 + 未知 slug toast。
4. 验证：拦截路径单测、历史投影测试。

## 批次 H — #7 桌宠步骤 1（纯 renderer）

1. `floating-chat/store` 加 `mode: 'full'|'pet'`；`FloatingFrame` pet 变体（形象区 + 迷你单行 Composer）；主题链不变。
2. 验证：组件测试。OS 窗口 + 形象上传延 v2。
