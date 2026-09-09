# Plan：网络代理设置（仅 HTTP + web 隐藏）

对应 design：同目录 `design.md`。

## 任务

1. **数据模型** → verify: typecheck
   - `packages/core/src/types.ts`：`AppSettings` 加 `proxy?: { url?: string; noProxy?: string }`
   - `packages/app/src/lib/host-bridge.ts`：`HostSettings` 加同字段；`HostCapabilities` 加 `proxy: boolean`
2. **capability 接线** → verify: `host-capabilities.structure.test.ts` 通过
   - `packages/desktop/src/host-bridge-electron.ts`：`proxy: true`
   - `packages/web/src/host-bridge-web.tsx`：`proxy: false`
   - `packages/app/src/lib/host-capabilities.structure.test.ts`：白名单加 `"proxy"`
3. **主进程** → verify: `settings.test.ts` 新增用例通过
   - `packages/desktop/electron/settings.ts`：`saveSettings` merged 加 proxy；`getMaskedSettings` 透传；`applySettingsToEnv` 写/删 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` 并重设 dispatcher
   - `packages/desktop/electron/main.ts`：`ensureServer()` 前 `setGlobalDispatcher(new EnvHttpProxyAgent())`
   - `packages/desktop/package.json`：dependencies 加 `"undici": "^7.29.0"`
4. **renderer** → verify: `settings-store.test.ts` 通过
   - `packages/app/src/stores/settings-store.ts`：`proxy` 状态 + `setProxy`
   - 新增 `ProxyPanel.tsx`（仿 `TtsSettingsPanel`），general tab 挂载，`capabilities.proxy` 条件渲染
5. **i18n**（加载 i18n skill）→ verify: `npm run` i18n check
   - en / zh-CN / zh-TW 加 `settings.proxy.*`
6. **冒烟 + 手动** → verify: 抓包确认
   - Node 侧冒烟通过（setGlobalDispatcher 生效，本地 CONNECT 中继 200 OK）；Electron 实机待 Clash 抓包
   - Clash 7890 + OpenCode Go 请求经代理

## 范围外

SOCKS5、electron-updater 代理。
