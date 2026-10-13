# web_search 与 DeepSeek 解耦 plan

用户决策：不接受硬耦合（提供解耦方案），`web_search` 不进 assistant 默认工具集（已合入 `095acf5`）。
本 plan 执行用户选定的 **A+B**。

## 假设（有异议请叫停）

- Env 名沿用 `SPHERSE_IMAGE_*` 前缀惯例：`SPHERSE_WEB_SEARCH_API_KEY / _BASE_URL / _MODEL`。
- **无 deepseek key 回退**：`webSearch.apiKey` 未配则工具不可用，不再读 `DEEPSEEK_API_KEY`。
- **不做一次性迁移**：web_search 随本次分支首次合入、尚未发布，无老数据需要迁移；配过 DeepSeek key 的用户需在新设置节重填。
- 默认 baseUrl `https://api.deepseek.com/anthropic`、默认 model `deepseek-v4-flash` 是默认值（可换任意 Anthropic Messages 兼容搜索端点），不是写死 vendor。
- baseUrl/model 未配时 settings 删 env，tool 内回退默认值；API key 增删直写直删（沿用 `IMAGE_*` 先例，不做 shell 原值 save/restore）。

## A：后端配置注入（core，仅 core 包）

- [x] `types.ts` 新增 `WebSearchSettings { apiKey?; baseUrl?; model? }`，`AppSettings` 加 `webSearch?`
- [x] `tools/web-search.ts`：新增 `WebSearchBackend { baseUrl; model; apiKeyEnv }` + `defaultWebSearchBackend()`（读 env，默认值如上）+ `readWebSearchApiKey(backend?)`；`WebSearchDeps` 加 `backend?: Partial<WebSearchBackend>`；URL=`{baseUrl}/v1/messages`、model 取 backend；缺 key 报错去 vendor 名；删 `providerEnvKey` import
- [x] `capabilities/web-search/index.ts`：透传 backend，默认 reader 换 `readWebSearchApiKey`
- [x] `catalog.ts`：删 `providerEnvKey`（唯一消费者消失）
- [x] 测试：`tools/web-search.test.ts` 跟进 env 名/函数名并加 backend-override 用例；`builtin-assembly.test.ts` 可见性用例换 env + 改标题；`capabilities/web-search.test.ts` 应无改动（注入式）
- [x] verify：`npm test --workspace=packages/core`

## B：独立 webSearch 设置节（desktop + app + i18n）

- [x] desktop `settings.ts`：`saveSettings` 合并 `webSearch`（apiKey 掩码合并沿用 `****` 惯例）；`getMaskedSettings` 返回掩码后 key；`applySettingsToEnv` 落 3 个 env；`settings.test.ts` 加用例（mask round-trip、掩码合并保留旧 key、env 置/清）
- [x] app `host-bridge.ts`：`HostSettings` 加 `webSearch?`
- [x] app `settings-store.ts`：加 `webSearch` state + `setWebSearch`（仿 `setProxy`，含 undefined-dropping）；`settings-store.test.ts` 加用例
- [x] app 新增 `WebSearchPanel.tsx`（key 用 password 框，仿 ProxyPanel），general tab 挂载（仿 ProxyPanel，不做 capability 门控；web 宿主 localStorage 全量透传）
- [x] i18n：新增 `settings.webSearch.*` 三语 + 改写 `tool.web_search_hint` 三语（去 DeepSeek 前置要求，保留费用提示）；`npm run check:i18n`
- [x] verify：desktop/app/i18n 单测 + `npm run build` + `npm run typecheck` + `npm run lint`

提交：A、B 各一笔 commit（`fix:` 前缀）。
