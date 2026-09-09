# 网络代理设置（用户可配置 HTTP 代理）

> 状态：**待实施（优先）**。决策：仅 HTTP（`EnvHttpProxyAgent` 不支持 SOCKS，SOCKS 不做）；electron-updater 不走代理；web 端隐藏（新增 `proxy` capability，electron=true / web=false）。

## 背景

用户侧常见需求：LLM provider（OpenCode Go / OpenAI / Anthropic 等）的出站流量需经本地代理（如 Clash `http://127.0.0.1:7890`）。当前 Spherse **完全没有代理支持**：无设置项、无 env 注入、无 undici dispatcher 配置。

## 调研结论

### 出站流量都在哪

- **LLM 请求全部跑在 Electron 主进程**（`packages/desktop/electron/main.ts:15` `ensureServer()` 内嵌 `@spherse/server` → core → pi-ai → Node 全局 fetch/undici），不经 Chromium 网络栈（那是 renderer 的事）。
- MCP 连接（`packages/core/src/mcp/mcp-client.ts:257-280`）：stdio 子进程继承 `{...process.env, ...config.env}`（`:262`）；http/sse 走 MCP SDK 的全局 fetch（`requestInit` 只带 headers）。
- 其它出站：marketplace 下载（`packages/server/src/marketplace.ts:45,63,110`）走全局 fetch；electron-updater（`desktop/electron/updater.ts`）走 Electron net 栈，**独立接缝，不受 undici 影响**。

### 关键事实：Node fetch 默认不读代理 env

- Node（含 Electron 41 内嵌的 Node 22）的 `globalThis.fetch` **默认不解析 `HTTPS_PROXY`/`HTTP_PROXY`**（无 dispatcher，无 `NODE_USE_ENV_PROXY`）。
- OpenAI SDK 6.x / Anthropic SDK 0.123 也**不自读代理 env**（需手动传 `fetchOptions.dispatcher`，即 undici `ProxyAgent`）。
- pi-ai 0.85.1 自带代理解析（`dist/utils/node-http-proxy.js:116`，读 `${proto}_proxy`/`all_proxy`/`no_proxy`，先 per-request `options.env` 再 `process.env`），但**只被两个 adapter 消费**：Bedrock（`bedrock-converse-stream.js:96-108`）与 Bun 下的 codex-WS。主流的 openai-completions / anthropic-messages / openai-responses 走 SDK + 全局 fetch，不消费它。
- pi-ai 的 `ProviderRequestOptions` 已有 `fetch?`（`types.d.ts:57-62`）与 `env?`（`:63-68`，注释明说覆盖 proxy 变量）且 `buildBaseOptions` 全链路透传（`api/simple-options.js:10-34`）——但 `env` 目前只到达上述两个 proxy 路径。

### 接缝对比

| 方案 | LLM SDK (openai/anthropic) | pi-ai 原始 fetch | Bedrock | MCP http/sse | MCP stdio | marketplace |
|---|---|---|---|---|---|---|
| **(a) env + undici `EnvHttpProxyAgent` 全局 dispatcher** | ✅ | ✅ | ✅（pi-ai 自读 env） | ✅ | ✅（env 继承） | ✅ |
| (b) 包装 `globalThis.fetch`（ProxyAgent） | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| (c) StreamFn per-request `fetch`/`env` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 实施方案（方案 (a)，已确认，审查通过）

1. **数据模型**：core `AppSettings`（`packages/core/src/types.ts`）与 app `HostSettings`（`packages/app/src/lib/host-bridge.ts:58`）各加 `proxy?: ProxySettings`（core 独立命名接口，`export type` 导出）；`HostCapabilities` 加 `proxy: boolean`。
2. **capability 接线**：electron capabilities `proxy: true`（`packages/desktop/src/host-bridge-electron.ts`），web `proxy: false`（`packages/web/src/host-bridge-web.tsx`）；同步更新 `host-capabilities.structure.test.ts` 的字段白名单。
3. **主进程**：`saveSettings` merged 加 `proxy: incoming.proxy ?? prev?.proxy`，`getMaskedSettings` 透传 `proxy`；`applySettingsToEnv` 写大小写六键（`HTTP(S)_PROXY`/`NO_PROXY` + 小写），保存即热生效。语义（review 确认）：仅接受可解析的 `http(s)://` URL，非法值忽略并 warn（fail-open，不抛错——`new ProxyAgent` 遇非法 URI 会同步抛错）；`settings.proxy` 从未配置时不动 env（系统预设保留），一旦配置过 Spherse 接管六键（有值覆盖、无值删除；清掉 URL 即显式直连，回不到“跟随系统”）。
4. **全局 dispatcher**：`main.ts` 在 `ensureServer()` 前 `setGlobalDispatcher(new undici.EnvHttpProxyAgent())`（覆盖无 settings 文件时 `restoreEnvFromSettings` 提前返回的路径）；`applySettingsToEnv` 内保存后重设一次（热切换必需——undici 7.29 的 `EnvHttpProxyAgent` 在构造时读 `HTTP(S)_PROXY`，仅 `NO_PROXY` 是惰性的）；undici 显式声明为 desktop 依赖（实测 7.29.0）。
5. **renderer**：`settings-store.ts` 加 `proxy` 状态 + `setProxy`（仿 `setTts`）；新增 `ProxyPanel.tsx`（仿 `TtsSettingsPanel`）挂 general tab，用 `bridge.capabilities.proxy` 条件渲染；用户可见文案走 i18n。
6. **覆盖范围**：LLM（含 SDK 客户端）、MCP http/sse、marketplace 下载、MCP stdio 子进程（env 继承）。electron-updater 明确不覆盖。

## 已知风险

- **undici 版本偏移**：Node 侧冒烟通过（`setGlobalDispatcher` 影响全局 fetch，本地 CONNECT 中继 200 OK）；Electron 41 实机仍需 Clash 抓包确认；fallback 是用 undici 自己的 `fetch` 绑定 dispatcher 后赋给 `globalThis.fetch`。
- **热切换**：保存时写 env + 重设 dispatcher，确定生效；进行中的流式请求不受影响（可接受）。已连接的 MCP stdio 子进程需重连才继承新 env（可接受）。
- **electron-updater 走 Electron net**：如需代理，另走 `session.defaultSession.setProxy`（独立项，暂不做）。

## 验证思路（实施时）

- desktop 单测（`electron/settings.test.ts`）：proxy 持久化/merge、env 六键写删、非法值忽略、未配置不动 env、dispatcher 重设断言；`ipc/settings.test.ts` 透传一条。
- app 单测：`settings-store.test.ts` 补 `setProxy` + 旧 setter 带 proxy 回归；capability 结构测试更新字段白名单。
- 冒烟：Node 侧通过（见上）；失败则 fallback 用 undici 自带 `fetch` 覆盖 `globalThis.fetch`。
- 手动：Clash 7890 + OpenCode Go 请求经代理抓包确认（Electron 实机最终确认项）。
