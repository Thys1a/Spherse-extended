# 网络代理设置（用户可配置 HTTP/SOCKS 代理）

> 状态：**调研完成，未实施**。本文沉淀调研结论与推荐方案，供后续立项排期。

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

## 推荐方案（(a)，未实施）

1. **数据模型**：`AppSettings` 加 `proxy?: { url?: string; noProxy?: string }`（`packages/core/src/types.ts:125-136`）。
2. **设置 UI**：general tab（`packages/app/src/features/settings/index.tsx`）加 URL + NO_PROXY 字段；desktop `applySettingsToEnv`（`packages/desktop/electron/settings.ts:120-147`，已有 provider key 写 env 的先例）写 `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`，保存即热生效。
3. **全局 dispatcher**：`main.ts` 在 `ensureServer()` 前 `setGlobalDispatcher(new undici.EnvHttpProxyAgent())`；undici 需显式声明为 desktop 依赖（现为传递依赖）。
4. **同进程全部覆盖**：LLM（含 SDK 客户端）、MCP http/sse、marketplace 下载、MCP stdio 子进程（env 继承）。electron-updater 不覆盖（独立 net 栈，通常无需代理到 GitHub 时可接受；如需再单独处理）。

## 已知风险

- **undici 版本偏移**：npm 版 undici 7 的 `setGlobalDispatcher` 与 Electron 41 内置 fetch 消费的 symbol（`undici.globalDispatcher.1`）兼容性需一次冒烟验证；fallback 是用 undici 自己的 `fetch` 绑定 dispatcher 后赋给 `globalThis.fetch`。
- **热切换**：改代理设置后新 dispatcher 立即生效，但进行中的流式请求不受影响（可接受）。
- **electron-updater 走 Electron net**：如需代理，另走 `session.defaultSession.setProxy`（独立项，暂不做）。

## 验证思路（实施时）

- core 单测：`EnvHttpProxyAgent` 注入后 pi-ai SDK 请求经代理（本地 echo 代理捕获）。
- desktop：`applySettingsToEnv` 写 `HTTPS_PROXY`；settings IPC 链路。
- 手动：Clash + OpenCode Go 请求经代理抓包确认。
