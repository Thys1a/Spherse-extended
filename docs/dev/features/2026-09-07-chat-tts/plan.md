# [Feature] 聊天 TTS 本地朗读（桌面 Web Speech，一期）— 实施计划

> **For agentic workers:** 适合 subagent-driven-development 模式逐 task 实现。Steps 用 checkbox 跟踪。每个 Task 结束后运行对应 workspace 的 build + test 验证。

**Design doc:** `docs/dev/features/2026-09-07-chat-tts/design.md`

**关键约定（实现时必须遵守）:**

- 控制器为 **app 级单例**，全局同时最多一段朗读；`speak(messageId, text)` 自动 cancel 前一段；状态进 `tts-store`，不 reactive 到 streaming store。
- markdown 剥离用**纯函数**（非读 DOM）；句子切分规避 Chromium 长句截断 bug。
- `autoRead` 仅对**成功 turn**（stopReason 正常）且窗口聚焦时触发，默认关；会话切换调 `controller.stop()`。
- 设置链 **5 处触达**都要改，尤其 `getMaskedSettings`（漏透传 → 下次保存静默清空存量）。
- feature gate `tts` ELECTRON_ONLY；`SpeakButton` 与设置小节包 `FeatureGate`。
- `speechSynthesis` 在 jsdom 不存在 → 测试统一 `vi.stubGlobal` 伪造，`onend` 手动推进队列。

---

### Task 1: 纯函数与控制器（`features/chat/tts/`）

**Files:**
- Add: `packages/app/src/features/chat/tts/speech-text.ts`
- Add: `packages/app/src/features/chat/tts/tts-controller.ts`
- Add: `packages/app/src/features/chat/tts/tts-store.ts`
- Add: 对应单测

- [ ] **Step 1: `speech-text.ts`**：`extractSpeechText(markdown): string`（代码围栏占位/跳过、行内代码保留、链接取锚文本、剥离标题/强调）；`splitSentences(text, maxLen=200): string[]`（按 `。！？.!?` + 换行切分）。
- [ ] **Step 2: `tts-store.ts`**：zustand `{ messageId?, status: "idle"|"speaking", sessionId? }` + `start/stop/setSession` actions。
- [ ] **Step 3: `tts-controller.ts`**：单例，封装 speechSynthesis——`speak(messageId, text)` 切分排队逐段 `onend`；`stop()` cancel + 清队列；监听 `voiceschanged` 解析 `voiceURI`；`pickVoice(voices, voiceURI?, locale?)` 前缀回退（`zh-CN`→`zh-CN`/`zh`，兼容 Windows SAPI 名）。
- [ ] **Step 4: 单测**：`extractSpeechText`（围栏/行内代码/链接/标题）；`splitSentences` 边界；控制器 stub speechSynthesis——排队、cancel、voiceschanged 选音色、stopReason 过滤。
- [ ] **Step 5: 验证**：`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`。

### Task 2: UI 接入（按钮 + 自动朗读）

**Files:**
- Add: `packages/app/src/features/chat/tts/SpeakButton.tsx`
- Modify: `packages/app/src/features/chat/MessageItem.tsx`（hover 工具栏挂 SpeakButton）
- Modify: `packages/app/src/features/chat/index.tsx`（会话切换 stop 的 effect）
- Add: 组件测试

- [ ] **Step 1: `SpeakButton`**：assistant 且 `!message._streaming` 时渲染；`messageId === current` 显示 stop 图标；含 `title`/`aria-label`。
- [ ] **Step 2: 挂载**：`MessageItem.tsx:125-135` hover 工具栏插入 SpeakButton（非 streaming 分支）。
- [ ] **Step 3: 会话切换 stop**：`Chat` 组件 effect 监听 sessionId 变化调 `controller.stop()`。
- [ ] **Step 4: 组件测试**：播放/停止切换 + aria-label。
- [ ] **Step 5: 验证**：`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`。

### Task 3: 设置链 + feature gate + autoRead

**Files:**
- Modify: `packages/core/src/types.ts`（`AppSettings.tts?`）
- Modify: `packages/desktop/electron/settings.ts`（saveSettings 白名单 + getMaskedSettings 透传）
- Modify: `packages/app/src/lib/host-bridge.ts`（`HostSettings.tts?`）
- Modify: `packages/web/src/host-bridge-web.tsx`（load/persist 透传）
- Modify: `packages/app/src/stores/settings-store.ts`（tts setter）
- Modify: `packages/app/src/features/settings/index.tsx`（general tab「朗读」小节）
- Modify: `packages/app/src/lib/feature-registry.ts`（`tts` ELECTRON_ONLY）
- Modify: `packages/i18n/src/locales/{zh-CN,zh-TW,en}.ts`

- [ ] **Step 1: 类型**：`AppSettings.tts?: { voiceURI?; rate?; autoRead? }`；`HostSettings.tts?` 同步。
- [ ] **Step 2: desktop settings**：saveSettings 合并 `tts`、getMaskedSettings 透传（勿漏）。
- [ ] **Step 3: web persist**：host-bridge-web 透传 tts。
- [ ] **Step 4: settings-store + UI**：tts setter（仿 `setDebugToolsEnabled`）；general tab 新增「朗读」小节（voice 下拉/rate 滑杆/autoRead 开关）。
- [ ] **Step 5: feature gate**：`feature-registry` 加 `tts`（ELECTRON_ONLY）；SpeakButton 与设置小节包 `FeatureGate`。
- [ ] **Step 6: autoRead**：监听 `agent_end`，仅成功 turn + 窗口聚焦时朗读末条（默认关）。
- [ ] **Step 7: i18n**：三语新增 tooltip/设置文案。
- [ ] **Step 8: 验证**：`npm run build --workspace=packages/core`；`npm run build --workspace=packages/desktop`；`npm run build --workspace=packages/i18n`；`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`；`npm run check:i18n`；`npm run lint`。

---

## Task 依赖与并行性

```
Task 1 (纯函数/控制器) ──► Task 2 (UI) ──► Task 3 (设置链 + gate + autoRead)
```

Task 1/2 是 renderer 逻辑，可先行；Task 3 跨 core/desktop/app/web/i18n 五包，最后收口。

## 全局验证

```bash
npm run build
npm run verify
```

可选（桌面实测）：`npm run dev` 启动桌面应用，Windows 下验证 SAPI 音色朗读 + 长句截断规避 + autoRead 手势策略。
