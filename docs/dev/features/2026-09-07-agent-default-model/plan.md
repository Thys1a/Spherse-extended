# [Feature] per-agent 默认模型（UI 补齐）— 实施计划

> **For agentic workers:** 适合 subagent-driven-development 模式逐 task 实现。Steps 用 checkbox 跟踪。每个 Task 结束后运行对应 workspace 的 build + test 验证。

**Design doc:** `docs/dev/features/2026-09-07-agent-default-model/design.md`

**关键约定（实现时必须遵守）:**

- **runtime 零改动**：`resolveEffectiveModelId`（`core/session/status.ts:12`）已实现 `profile.model || defaultModel`，每 turn 重解析、热切换跳过 pinned，均有测试，不碰 core。
- **parse 必须把 `model` 加入 frontmatter 解构**（`agent-markdown.ts:55`），否则 `extraFrontmatter` 与 `formData.model` 双写冲突。
- 新建 `AgentModelField.tsx`，**不复用** `DefaultModelField`（settings 强耦合）；首项「跟随全局默认」= 不写 `model` 键；禁自由文本输入。
- 不做 core 层写时校验；UI 封闭选项 + 运行时 `MODEL_NOT_CONFIGURED` 降级兜底。

---

### Task 1: 序列化层（`agent-markdown.ts`）

**Files:**
- Modify: `packages/app/src/features/agent-dialog/agent-markdown.ts`
- Modify/Add: `agent-markdown` 单测

- [ ] **Step 1: `AgentFormData` 加 `model?: string`**（`:20-28`）。
- [ ] **Step 2: `parseAgentMarkdown` 解构加 `model`**（`:55`）：`const { name, alias, tools, context, timePerception, yolo, model, ...extra }`，`formData.model = typeof model === "string" && model.trim() ? model : undefined`。
- [ ] **Step 3: `buildAgentMarkdown` 条件写入**（`:80` 附近）：`formData.model` 有值写 `frontmatter.model`；清空则不写。
- [ ] **Step 4: 单测**：model 设置/清空 round-trip；旧文件 `model` 键从 extraFrontmatter 迁为一等字段兼容（不双写、不丢失）。
- [ ] **Step 5: 验证**：`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`。

### Task 2: UI（新组件 + dialog 接入）

**Files:**
- Add: `packages/app/src/features/agent-dialog/AgentModelField.tsx`
- Modify: `packages/app/src/features/agent-dialog/AgentDialogForm.tsx`
- Modify: `packages/i18n/src/locales/{zh-CN,zh-TW,en}.ts`
- Add: 组件测试

- [ ] **Step 1: `AgentModelField`**：参考 `DefaultModelField` 的 Combobox 交互；props `{ providers, apiKeys, globalDefault, value, onChange }`；首项「跟随全局默认（当前：xxx）」值 = 空；按已配 API key 过滤 provider，无可用时留 `configureFirst` 提示。
- [ ] **Step 2: 数据 hook**：`AgentDialogForm` 拉 `bridge.getSupportedProviders()` + `bridge.getSettings()`（`models.text.defaultModel` 作 hint、`models.text.providers` 作 apiKeys）。
- [ ] **Step 3: 接入表单**：`formData.model` 绑定；提交经 `buildAgentMarkdown` 序列化。
- [ ] **Step 4: i18n**：三语新增「默认模型」标题、「跟随全局默认」选项文案。
- [ ] **Step 5: 组件测试**：选模型 → 提交 payload 带 model；选「跟随全局默认」→ 不带；`AgentModelField` 过滤逻辑。
- [ ] **Step 6: 验证**：`npm run build --workspace=packages/i18n`；`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`；`npm run check:i18n`；`npm run lint`。

---

## Task 依赖与并行性

```
Task 1 (序列化) ──► Task 2 (UI + i18n)
```

## 全局验证

```bash
npm run build
npm run verify
```

可选（若涉及 Electron 启动 / agent 创建保存）：`npm run test:e2e --workspace=packages/app -- e2e/<agent 相关 spec>`
