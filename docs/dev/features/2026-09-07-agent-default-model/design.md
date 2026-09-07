# per-agent 默认模型（UI 补齐，口径 A）

## 背景

用户要求「为每个项目的每个 agent 配置默认模型，若无则使用全局默认」。代码调研发现 runtime 已就绪：

- `AgentProfile.model?: string` 已存在（`packages/core/src/types.ts:25`），存于 `.spherse/agents/<slug>/profile.md` frontmatter。
- fallback 链 `profile.model || globalDefault` 已实现（`packages/core/src/session/status.ts:12-17` `resolveEffectiveModelId`），且每 turn 重解析（`agent-runner.ts:462` `ensureModel`）、全局默认热切换时跳过 pinned agent（`agent-runner.ts:344-353` `applyDefaultModel`），均有测试（`__tests__/session/session-manager.test.ts:309-324`）。
- `manage_agent` 工具已支持 `model` 参数（`packages/core/src/tools/manage-agent.ts:226,256`）。

**缺的只有 UI + 序列化**：`AgentFormData`（`packages/app/src/features/agent-dialog/agent-markdown.ts:20-28`）无 `model` 字段；agent dialog 无 model picker；无写时 catalog 校验。

口径确认：**仅 per-agent（选项 A）**，不引入被 `2026-07-04-model-not-configured` bugfix 移除的 project-level defaultModel。

## 设计

### 序列化层（`agent-markdown.ts`）

- `AgentFormData` 新增 `model?: string`（`agent-markdown.ts:20-28`）。
- `parseAgentMarkdown`：把 `model` 加入 frontmatter 解构（`agent-markdown.ts:55` 的 `const { name, alias, tools, context, timePerception, yolo, ...extra }` 改为 `... yolo, model, ...extra }`），作为一等字段取出——**必须同时从 `extra` 剔除**，否则 `buildAgentMarkdown` 里 `...extraFrontmatter` 与 `formData.model` 双写冲突。
- `buildAgentMarkdown`：`formData.model` 有值写入 frontmatter `model` 键；用户清空则不写（配合「跟随全局默认」选项）。

### UI（`AgentDialogForm.tsx` + 新组件）

- 新增「默认模型」combobox。`DefaultModelField`（`features/settings/DefaultModelField.tsx:19-101`）与 settings 强耦合（import `settings/types` 的 `ProviderConfig`、`SectionTitle`、settings 专属 i18n key，且**无空选项**），故**不复用**，新建 `features/agent-dialog/AgentModelField.tsx`，仅参考其 Combobox 交互。
- 数据源：`bridge.getSupportedProviders()` + `bridge.getSettings()`（按已配 API key 的 provider 过滤，同 settings 的 DefaultModelField）。agent dialog 需新增加载这两个数据的 hook（dialog 现不拉 settings）。
- 选项设计：**首项「跟随全局默认（当前：xxx）」= 不写 `model` 键**（hint 显示 `settings.models.text.defaultModel` 当前值）；其余为 catalog 内模型。**不支持自由文本输入**，杜绝写错 model id——这是写时校验的主要手段。未配 API key 的 provider 模型被过滤（同 DefaultModelField），UI 留 `configureFirst` 类提示。

### 写时校验取舍

- **不做 core 层硬校验**：会给 `AgentProfileStore` 注入 `ModelCatalog` 依赖，破坏 store/catalog 分层。
- UI 封闭选项 + 现有运行时优雅降级兜底：手改 profile.md 写错 id → sendMessage 时 `MODEL_NOT_CONFIGURED` 错误气泡（链路已有 i18n 文案），与现状一致。

### 展示增强（可选，v1 可不做）

- AgentRow / 会话头展示 effective model 徽标（`resolveEffectiveModelId` 已导出可直接用）。

## Runtime

零改动（`resolveEffectiveModelId` 已实现 `profile.model || defaultModel`，每 turn 重解析，热切换跳过 pinned）。

## 已知取舍

- 仅文本模型组（image 组走 env，per-agent 覆盖不适用，同现状）。
- 无 core 层校验，手改文件错误静默降级为运行时错误（有提示）。
- project 级默认不引入（口径 A；其历史移除理由见 `docs/dev/bugfix/2026-07-04-model-not-configured/plan.md`）。

## 验证

- `agent-markdown` 单测：model 设置/清空的 round-trip；旧文件 `model` 键从 extraFrontmatter 迁为一等字段的兼容。
- `AgentDialogForm` 组件测试：选择模型 → 提交 payload 带 model；选「跟随全局默认」→ 不带。
- i18n 三语 + `npm run check:i18n`；lint、typecheck、相关 workspace 单测。

## 规模

~300-400 行含测试。
