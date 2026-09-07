# [Feature] 自定义 Provider 请求头 — 实施计划

> **For agentic workers:** 适合 subagent-driven-development 模式逐 task 实现。Steps 用 checkbox（`- [ ]`）跟踪。每个 Task 结束后必须运行对应 workspace 的 build + test 验证。

**Design doc:** `docs/dev/features/2026-09-07-custom-provider-headers/design.md`

**关键约定（实现时必须遵守）:**

- **请求级注入，不碰 provider 默认层**：`suppressUserAgent` 加 `customHeaders?: ProviderHeaders` 参数，在 `inject` 里合并为 `headers: { "User-Agent": null, ...customHeaders, ...options?.headers }`。依赖该顺序保证「抑制默认 UA → 应用自定义头（含 UA）→ 单次请求可覆盖」。**不要**在 `createProvider`/`Model` 上设 headers（User-Agent 会被请求级 null 抑制）。
- `CustomProviderDef.headers` 可选（`headers?: Record<string, string>`），存量 settings.json 无此字段，行为不变，无需迁移。
- 校验仅 UI 层（同现有 CustomProviderDialog 风格）；header name 符 RFC 7230 token、value 禁 CR/LF、上限 20 条 / 单条 ≤ 1KB。
- 作用域仅 LLM chat completions；image 与内置 provider 不动。

---

### Task 1: Core 层 — 类型 + 请求级注入

**Files:**
- Modify: `packages/core/src/types.ts`（`CustomProviderDef` 加 `headers?`）
- Modify: `packages/core/src/model-providers/catalog.ts`（`suppressUserAgent` 加参 + `buildCustomProvider` 传 `def.headers`）
- Modify: `packages/core/src/__tests__/model-providers/custom-provider-user-agent.test.ts`（或新增 headers 用例）

- [ ] **Step 1: `CustomProviderDef` 加 `headers?: Record<string, string>`**（`types.ts:157` 附近），确认从 barrel 导出（若 `CustomProviderDef` 已导出则无需改 barrel）。
- [ ] **Step 2: `suppressUserAgent` 加参数**（`catalog.ts:114`）：签名 `suppressUserAgent(api, customHeaders?: ProviderHeaders)`；`inject` 改为 `headers: { "User-Agent": null, ...customHeaders, ...options?.headers }`。
- [ ] **Step 3: `buildCustomProvider` 传参**（`catalog.ts:152`）：`api: suppressUserAgent(openAICompletionsApi(), def.headers)`。
- [ ] **Step 4: 补/改测试**：断言自定义头（含 User-Agent 与非 UA 头）合并进请求、且单次请求 options.headers 可覆盖 customHeaders。
- [ ] **Step 5: 验证**：`npm run build --workspace=packages/core`；`npm test --workspace=packages/core`。

### Task 2: App 层 — UI + i18n

**Files:**
- Modify: `packages/app/src/features/settings/CustomProviderDialog.tsx`（headers 键值编辑器 + 校验）
- Modify: `packages/app/src/features/settings/use-settings-form.ts`（表单状态透传 headers，若 dialog 内自持则视情况）
- Modify: `packages/i18n/src/locales/{zh-CN,zh-TW,en}.ts`
- Add: 对应组件测试（`CustomProviderDialog` 键值编辑/非法拒绝）

- [ ] **Step 1: 表单状态**：`CustomProviderDialog` 内增 headers 行（增/删），提交 payload 带 `headers`（空时省略）。
- [ ] **Step 2: 校验**：name 符 RFC 7230 token、value 禁 CR/LF、上限 20 条 / 单条 ≤ 1KB；不合法禁止提交。
- [ ] **Step 3: i18n**：三语新增 key（标题「请求头」、增删行按钮、非法提示）。
- [ ] **Step 4: 组件测试**：键值增删、非法 header name/value 拒绝提交。
- [ ] **Step 5: 验证**：`npm run build --workspace=packages/i18n`；`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`；`npm run check:i18n`；`npm run lint`。

---

## Task 依赖与并行性

```
Task 1 (core) ──► Task 2 (app + i18n)
```

Task 2 依赖 Task 1 的 `CustomProviderDef.headers` 类型。

## 全局验证

```bash
npm run build
npm run verify          # lint + build + typecheck + unit tests + i18n check
```
