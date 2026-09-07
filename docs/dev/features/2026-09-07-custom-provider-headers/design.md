# 自定义 Provider 请求头（Custom Request Headers）

## 背景

用户提出「增加请求头项」，参考 opencode 的 provider `options.headers` 能力（`provider.<id>.options.headers`，用于网关/代理/Kimi 等需要额外鉴权头、路由元数据或 UA 的场景）。Spherse 使用 pi-agent-core / pi-ai 作为 LLM 运行时，需评估在 Spherse 侧给 LLM provider 的 HTTP 请求注入自定义请求头。

调研结论：

- Spherse 的 `CustomProviderDef`（`packages/core/src/types.ts:157`）只有 `id/name/baseUrl/models/keyless/contextWindow/maxTokens`，**无 headers 字段**；`buildCustomProvider`（`packages/core/src/model-providers/catalog.ts:132-154`）未透传任何 headers。
- **pi-ai 0.84.4 原生支持自定义请求头**：`ProviderRequestOptions.headers`、`CreateProviderOptions.headers`、`Model.headers`、`ModelsRequestTransforms.transformHeaders` 均有；且 Spherse 自己的 `suppressUserAgent` 包装（`catalog.ts:114-130`）已会把 `options?.headers` 合并进每次请求——证明任意请求头已能到达 HTTP 层。
- 因此该功能 **100% 由 Spherse 侧实现**，无需改 pi-ai。

## 设计

### 类型与存储

- `CustomProviderDef` 新增 `headers?: Record<string, string>`（`packages/core/src/types.ts:157`）。header 值存于「定义」（同 baseUrl），与 API key（凭据层，有 masking）分离，`getMaskedSettings` 对 customProviders 本就透传，无需改 masking。
- 作用域：**provider 级**，一次注入对该 provider 全部模型生效。自定义 provider 本就是用户自建网关（baseUrl + 自有模型表），鉴权/路由头天然对整个网关生效；model 级粒度暂无场景。

### 装配链路（请求级注入）

**注入点选请求级，不选 provider 默认层。** 原因：`suppressUserAgent`（`catalog.ts:114-130`）在**每次请求**注入 `headers: { "User-Agent": null, ...options?.headers }`，而 pi-ai 的合并语义是「请求级覆盖 provider 默认；`null` 抑制默认头」。若把自定义 headers 放 provider 默认层（`createProvider.headers` / `Model.headers`），任意头能生效，但 **`User-Agent` 会被请求级 `null` 抑制而发不出去**——而自定义 UA（如 Kimi `User-Agent: KimiCLI/1.30.0` 解锁高配额）恰恰是首要场景。

修正方案：给 `suppressUserAgent` 加参数，在请求级合并自定义头：

```ts
function suppressUserAgent(api: ProviderStreams, customHeaders?: ProviderHeaders): ProviderStreams {
  const inject = <T extends { headers?: ProviderHeaders }>(options?: T): T => ({
    ...(options ?? ({} as T)),
    headers: { "User-Agent": null, ...customHeaders, ...options?.headers },
  });
  // ...其余同现状（stream/streamSimple/fetchDeferred/cancelDeferred 均走 inject）
}
```

`buildCustomProvider` 改为 `api: suppressUserAgent(openAICompletionsApi(), def.headers)`。合并顺序保证：

1. `null` 抑制 pi-ai 默认 UA
2. `customHeaders` 覆盖（含 User-Agent 及任意头）
3. 单次请求 `options?.headers` 仍可覆盖

该路径**完全不依赖** `createProvider.headers` / `Model.headers` 是否存在（安装后 pi-ai 0.84.4 无需再验证该 API），风险清零；且与已有测试 `custom-provider-user-agent.test.ts`（「显式 headers 覆盖抑制」）语义一致。

### 设置传播（已通，自动生效）

`saveSettings` 整体替换 `customProviders`（`packages/desktop/electron/settings.ts:99`）→ `applySettingsToEnv` → `syncCustomProviders`（`:141`）→ catalog 重建 provider——设置保存即热生效，无需额外传播代码。

### UI

- `CustomProviderDialog.tsx`（`packages/app/src/features/settings/CustomProviderDialog.tsx`）新增「请求头」键值对编辑器（增/删行、key=header 名、value=值）。校验放在 UI 层（与现有 dialog 校验风格一致）：
  - header name 符合 RFC 7230 token 字符（不允许空格/`()<>@,;:\"/[]?={}`/控制字符）
  - value 禁 CR/LF（防 header 注入）
  - 上限 20 条 / 单条 value ≤ 1KB
- 可选：抽公共 `coerceHeaders`/校验函数（参考 MCP 侧 `packages/core/src/mcp/config.ts:87`），若与 MCP 版可复用则提取，否则 UI 本地实现——避免为单用途过早抽象。

### 作用域边界

- 仅 chat completions 走此链路（LLM 自定义 provider）。image 生成 provider（`zhipu-images.ts:115` / `openai-images.ts:165` 硬编码 Authorization/Content-Type）不在本期。
- 内置 provider（非 custom）不加 headers 配置（需要扩展 `ProviderCredentials` 之外的配置面，暂无场景，一期不做）。

## 已知取舍

- **不 mask header 值**：现实场景（网关 token）恰恰要放这，接受现状；文档/UI 提示勿在 headers 放与 API key 等价的长效密钥。
- **校验仅 UI 层**：手改 settings.json 或 API 直写不受控，与现有 customProviders 校验层级一致（无 desktop 侧 schema 校验）。
- **provider 级而非 model 级**：model 级需求未现，避免过度设计。
- **请求级注入（非 provider 默认层）**：为让 `User-Agent` 等头不被 `suppressUserAgent` 的请求级 `null` 抑制而选请求级合并；代价是每次请求都携带 headers 副本（开销可忽略），且 headers 只作用于该 provider 的 chat 流式请求（正是本期目标）。

## 验证

- core：`buildCustomProvider` 透传 headers 到 `suppressUserAgent` 包装；仿 `packages/core/src/__tests__/model-providers/custom-provider-user-agent.test.ts` 断言自定义头（含 User-Agent 与非 UA 头）均合并进请求、且单次请求 options 可覆盖。
- app：`CustomProviderDialog` 键值编辑、非法 header name/value 拒绝提交的组件测试。
- i18n 三语 + `npm run check:i18n`；lint、typecheck、相关 workspace 单测。

## 规模

~300-400 行含测试。
