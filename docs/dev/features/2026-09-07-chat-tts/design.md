# 聊天 TTS 本地朗读（桌面 Web Speech，一期）

## 背景

用户要求为聊天对话增加 TTS 语音播放。调研确认：

- 全仓库无任何 audio/语音代码（`speechSynthesis`/`Audio`/TTS 均无命中），是全新领域。
- 桌面 renderer 是纯 Chromium（`packages/desktop/electron/window.ts:11-21`，`contextIsolation: true` 但只挡 Node 不挡 Web API，无 CSP 限制）→ `window.speechSynthesis` **直接可用、本地离线**。
- 朗读文本源 = `message.content`（markdown 字符串），流式与完成态都有（`features/chat/MessageItem.tsx:77`）；消息 hover 工具栏已存在（`MessageItem.tsx:125-135`）可挂按钮。
- 设置链路完整：`AppSettings`（`core/types.ts:119`）→ `desktop/settings.ts` 白名单 → IPC → renderer settings-store → 设置页 general tab（`features/settings/index.tsx:243`）。

范围确认：**仅桌面 + 手动按钮为主 + `autoRead` 默认关闭的设置开关**（feature gate ELECTRON_ONLY）。

## 设计

### 模块结构（`packages/app/src/features/chat/tts/`）

```
├─ tts-store.ts          # zustand：{ messageId?, status: idle|speaking, sessionId? }
├─ tts-controller.ts     # 单例控制器：封装 speechSynthesis，句子切分队列
├─ speech-text.ts        # 纯函数：markdown → 可朗读纯文本
└─ SpeakButton.tsx       # MessageItem hover 工具栏按钮（播放/停止切换）
```

### 关键设计决策

- **控制器为 app 级单例，非 per-session**：全局同时最多一段朗读；`speak(messageId, text)` 自动 cancel 前一段。状态进 `tts-store`，`SpeakButton` 据 `messageId === current` 切换 stop 图标。
- **markdown 剥离用纯函数而非读 DOM**：`extractSpeechText(content)`——代码围栏替换为「（代码块）」占位或跳过、行内代码保留文本、链接取锚文本、剥离标题/强调标记。纯函数可单测，符合仓库「不变量密集纯逻辑先写测试」分层。
- **Chromium 长句截断 bug 规避**：按句边界（`。！？.!?` + 换行）切分，~200 字符/段排队 `SpeechSynthesisUtterance`，逐段 `onend` 出队下一段。
- **自动朗读**（设置项 `autoRead`）：监听 `agent_end`，仅当末条 assistant 为**成功 turn**（stopReason 正常，排除 error turn 与撤回）且窗口聚焦时朗读末条。手动按钮为主入口，自动朗读默认关闭。
- **会话切换自动停止**：`Chat` 组件 effect 监听 sessionId 变化调 `controller.stop()`——避免朗读残留到无关会话（比「跨导航持续朗读+全局停止浮标」简单且可预期）。
- **voice 枚举异步性**：`getVoices()` 部分平台初始为空，控制器监听 `voiceschanged` 后再解析 `voiceURI`；未配置时按 settings `locale` 匹配 `voice.lang` 前缀选默认音色——需处理 Windows SAPI 音色名（如 `Microsoft Huihui`）与 `zh-CN`→`zh-CN`/`zh` 前缀回退。

### 数据与设置链（共 5 处触达）

```
1. core/types.ts: AppSettings.tts?: { voiceURI?: string; rate?: number; autoRead?: boolean }
2. desktop/electron/settings.ts: saveSettings 白名单 + getMaskedSettings 透传（漏透传会导致下次保存静默清空存量，见 maskModelGroup 先例）
3. app/lib/host-bridge.ts: HostSettings 补 tts 字段
4. web/src/host-bridge-web.tsx: loadSettings/persistSettings 透传（web 端仅存 localStorage）
5. app/stores/settings-store.ts + features/settings/index.tsx general tab 新增「朗读」小节
```

无 API key 敏感性，无 masking 问题。TTS 是纯 renderer 关注点（主进程无需知晓），走上述链路是为与 `theme`/`debugToolsEnabled` 的持久化方式保持一致（desktop electron-store / web localStorage），属「重 plumbing 但一致」的取舍。

### Feature gate

`feature-registry.ts` 新增 `tts` feature，`ELECTRON_ONLY` 起步（规避移动端 autoplay 手势与音色差异）；`SpeakButton` 与设置小节包 `FeatureGate`。后续翻矩阵即可开 web。

## 已知取舍

- **Windows SAPI 中文音色质量一般**（预期管理，非阻断）。
- **无手势自动朗读可能被 Chromium 策略拦截**：本会话内用户发过消息≈已有手势，大概率可播，需实测确认；手动按钮天然带手势无此问题。
- **`speechSynthesis` 在 jsdom 不存在** → 测试全部 `vi.stubGlobal` 伪造（utterance 队列用 `onend` 回调手动推进）。`vitest.setup.ts` 当前未 stub speechSynthesis，需在测试工具或各用例统一注入，避免漏 stub 偶发挂起。
- **web 端本期不做**：移动端手势策略、音色差异均未验证，留到后续翻 matrix。

## 验证

- 纯函数单测：`extractSpeechText`（围栏/行内代码/链接/标题各 case）、句子切分边界。
- 控制器单测：stub speechSynthesis——切分排队、cancel 语义、voiceschanged 后选音色、会话切换 stop。
- 组件测试：SpeakButton 播放/停止切换 + aria-label（图标按钮必须有 title/aria-label，见 app README:165）。
- i18n 三语 + `npm run check:i18n`；lint、typecheck、相关 workspace 单测。

## 规模

~600-900 行含测试。
