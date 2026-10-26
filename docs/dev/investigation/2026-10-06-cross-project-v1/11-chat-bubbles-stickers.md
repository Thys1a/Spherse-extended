# 聊天多气泡与表情包机制对照调研：对象 B / 对象 D

调研时间：2026-10-20
对象：对象 B 的源码（版本见本目录 `02`，只读）+ 对象 D 的仓库（只读 shallow clone + raw 校验，背景见本目录 `04`）+ Spherse 现状对照
定位前提：**三项目独立并行**。本调研只回答一件事——对象 B / 对象 D 的聊天功能里，哪些值得吸收、哪些不吸收。不主张合并，不产出 backlog / design 变更，不改 `docs/official/`。
关联：`02-language-learning-app.md`（对象 B 外语学习侧）、`04-companion-os.md`（对象 D 整机侧，记忆宫殿/主动消息已有结论，本篇不再展开）。

## 一、结论摘要

1. **两家的“多条回复”是两种完全不同的协议，不要混为一谈。**对象 B 是**结构化 JSON 多消息协议**：prompt 要求模型直接返回 `messages[]` 数组，前端按数组逐条落库、每条间隔 1500ms 依次冒泡。对象 D 是**文本切泡协议**：模型只返回一段纯文本，后处理按显式换行切泡，`[[SEND_EMOJI: 名]]` / `---` / 原子块保护是切泡过程中的标记语言。Spherse 现状两者都没有：单条 assistant message 只渲染一个气泡，多气泡只在 tool 循环产生多条 message 时附带出现。
2. **两家的“表情包”也不是同一个东西。**对象 B 的颜文字是**用户侧单向发送的文本消息类型**（`messageType: 'emoticon'`，点选即作为 user 消息发出，AI 只在 prompt 里被注入互动上下文）；对象 D 的表情是**AI 侧可主动发送的图片消息类型**（`type: 'emoji'`，`[[SEND_EMOJI: 名]]` → 按名解析 URL → 落库图片气泡，找不到名降级为文本）。Spherse 全仓无 sticker / 表情包 / reaction 实现。
3. **真正通用的只有三条**：多气泡的“生成侧分段约定 + 接收侧切分落库 + 逐条延迟渲染”、消息类型的“type 枚举 + 渲染 switch + 上下文反查”、用户侧的“暂存多条一次发出”。其余（双语对照、词汇标注、音乐/新闻/转账卡、群聊导演模式、语音条）都是各自垂直玩法的附属，不进内核；气泡换肤则是**已具备**（agent `theme.css`，见 §五 #7），不列入吸收项。
4. **许可与引用红线**：对象 D 为源码可见非开源许可，**只学概念不抄代码**；对象 B 源码为只读引用。本篇只做机制归纳，不贴原始 prompt 全文与源码大段实现；文件路径均为源码根相对路径，不含绝对路径与真实项目名。

## 二、对象 B：JSON 多消息数组 + 用户批量暂存

### 2.1 消息模型：单 `Message` 接口 + `messageType` 区分

- `types.ts` 的 `Message` 只有 `role: 'user' | 'assistant'`，靠可选字段扩展：`messageType?: 'normal' | 'recall' | 'emoticon' | 'interaction' | 'image' | 'letter' | 'gazette'`；颜文字带 `emoticonCategory` + 多语言 `emoticonLabel`，图片带 `imageId/MimeType/Size/宽高/识别状态`，语音带 `voiceData{audioUrl,duration,transcript}`，收藏带 `starred`。
- AI 侧多消息另有一套返回类型 `MultiMessageResponse{ messages?: MessageBlock[], content?, translation?, narration?, vocabulary?, starsAwarded?, userTranslations? }`，其中 `MessageBlock{ content, translation?, narration? }`。即：**存储是一条一存，传输是一轮多条**。

### 2.2 AI 多回复：prompt 要求分段 + `messages[]` 数组 + 1500ms 逐条落库

- 输出约束在各语言的词汇格式模板中（如韩语模板）：硬性要求“像发短信一样分成多条短消息，每条最多 2 句话、30 字左右、上限 75 字，宁可 15 条短消息也不要 1 条长消息；长难句单独放一条”。聊天预设另有“每条信息不要过长、适当分句”。
- 传输格式二选一：单消息 `{ content, translation, narration?, vocabulary?, starsAwarded }`，或多消息 `{ messages: [{ content, translation, narration? }], vocabulary, starsAwarded }`（模板内含完整单条/多条 JSON 示例）。`userTranslations` 数组与用户本轮多条消息按顺序对齐（换行拆分、不得合并遗漏）。
- 接收侧在聊天视图的批量发送函数中处理：检测到 `data.messages` 非空即进入多消息模式，每条经 `processTokens` 做词汇标注后构造独立 `Message`，用 `setTimeout(..., index * 1500)` 依次 `setMessages(prev => [...prev, aiMsg])`；期间切换角色则剩余消息路由回原角色（`onDelayedAIReply`），避免写错列表。信息卡扫描等到全部落库后（`(n-1)*1500+200ms`）再触发。
- 单消息模式走另一分支，一次落一条。本质是**“AI 自己分好段，前端只负责 staggered append”**，无文本二次切分。

### 2.3 用户多条：Shift+Enter 暂存 + 一次合并发出

- 输入区 `Shift+Enter` 为“暂存消息（只进列表、不调 AI）”，`pendingMessages: string[]` 累积；`Enter` 为批量发送：`[...pendingMessages, 当前输入]` 先把当前输入以 user 消息入列，再 `join('\n')` 合成 `combinedPrompt` 发给 AI。暂存条数显示“已暂存 N 条”，可清空。TRPG 视图有同构的 `stagedMessages` 实现（暂存只扣一次费）。
- 效果上用户也能“一次发多条”，但 wire 侧仍是一次请求；AI 侧的逐条翻译按换行拆分回多条对齐。

### 2.4 表情包 / 图片 / 语音 / 特殊消息

- **颜文字（用户侧）**：`components/EmoticonPicker.tsx` + `constants/emoticonLibrary.ts`（按情绪分类：开心/爱心/害羞等，每项含 15 语言 label）。点选即构造 `messageType: 'emoticon'` 的 user 消息直接入列，不调 AI；渲染走独立分支；`interactionPromptBuilder` 把本轮 emoticon / interaction 转成 `[用户互动]` 上下文注入下一次请求，AI 侧只“看见”不“拥有”。
- **图片消息**：`messageType: 'image'` + `ImageMessage.tsx` / `ImageLightbox.tsx`，走上传与识别服务（`imageUploadService` / `imageRecognitionService`），有 `recognizing/recognized/failed` 状态机。
- **语音**：`voiceData` 挂载 + `components/voice/`、`VoiceCall/` 通话视图，录音/转写/播放入口独立于主气泡流。
- **其余类型**：`letter`（书信密令游戏）、`gazette`（小镇日报分享卡，`gazetteData` 结构化 + content 存纯文本供上下文）、`interaction/body_touch`（身体接触）、`recall`（撤回占位）。消息操作有收藏（`starred`）、手动翻译、按用户/AI 消息 ID 的重新生成（向前找到对应 user 消息重发）。

### 2.5 输入与气泡个性化（UI 层，与内核无关）

- 输入框按钮布局可配（`chatButtonLayoutService`：image / stage / send / collector / bodyTouch / emoticon / recall / infoCard 的顺序与 zone），输入字数统计组件独立。
- 气泡换肤体系完整：`BubbleCharms` / `BubbleCustomizationPanel` / `BubbleExtension`（气泡旁装饰图，按 message id 做种稳定随机）、`bubble-previews-v2/v3.html` 预览页、50 款主题预设的气泡独立配色。均属表现层，不涉及消息协议。

## 三、对象 D：文本切泡 + 标记语言 + 卡片消息族

### 3.1 消息模型：29 项 `MessageType` 枚举

- 根 `types.ts` 的 `Message` 为 `{ id/charId/groupId/role/type/content/timestamp/metadata/replyTo }`，`MessageType` 共 29 项：`text | image | emoji | voice | interaction | transfer | system | secret_note | collaboration_file | social_card | chat_forward | xhs_card | score_card | music_card | mcd_card | luckin_card | html_card | news_card | vr_card | trpg_card | novel_card | world_card | sim_card | phone_card | webpage_card | theater_card | room_card | life_card | group_topic_card`。正文之外的玩法全部是“一种 type + 一种卡渲染 + 一种上下文归一化”（`messageFormat.normalizeMessageContent` 单点维护）。
- 本篇只展开聊天通用部分；`transfer/music/news/life` 等卡的副作用语义见 `04` 的 MCP/主动消息结论，不重复。

### 3.2 AI 多回复：纯文本 + 三级切泡管线（已用 raw 校验 `utils/chatParser.ts` 存在）

- **生成侧约定**：`utils/chatPrompts.ts` 的 ChatApp 格式节要求“一个气泡一行，气泡间直接另起一行”，禁时间戳与人名前缀。模型不产结构，只产分行文本。
- **接收侧管线**（`utils/applyAssistantPostProcessing.ts` 约 13 步 + `renderAndPersist`）：粗洗 → 二轮 LLM 钩子 → `ChatParser.parseAndExecuteActions` 先抽走动作标签 → 双语合并（`<翻译>/<原文>/<译文>` 合成 `原文%%BILINGUAL%%译文` 单气泡）→ 三级切泡：
  1. `ChatParser.splitResponse` 按 `[[SEND_EMOJI: 名称]]` 切出 `text | emoji` 段；
  2. 按 `---` 分块；
  3. `ChatParser.chunkText` **只按显式换行切泡**（`\r\n|\r|\n|U+2028|U+2029`，普通空格不断泡），`<语音>/<字幕>` 原子块用 SOH 占位符保护、切完还原，保证开闭标签不散落到不同气泡。
- 每片经 `hasDisplayContent`（剥标记后仍有可显示内容）与 sanitize 后逐条落库，条间夹 500–2000ms 打字延迟；引用 `[[QUOTE:]]` / `[回复 "…"]` 解析出 `replyTo` 挂首条气泡。通知横幅与气泡共用同一算法（`sanitize.sanitizeIntoSegments`），段数即气泡数即通知数。
- 与对象 B 的关键差异：**分段决策在接收侧**（换行即分泡），prompt 只管“换行”，不管“数组”。

### 3.3 表情包：AI 可主动发的图片气泡

- 发送标记 `[[SEND_EMOJI: 表情名]]` → `resolveEmojiForSend` 按名解析（含“分类: 名称”兜底）→ 落库 `{ type: 'emoji', content: url }`；无命中则降级为 `[表情：x]` 文本，不吞消息。
- 存储 `utils/db.ts`（`SavedEmojis` store，`Emoji{name,url,categoryId}`，`EmojiCategory.allowedCharacterIds` 按角色可见性过滤后注入 prompt）；渲染 `components/chat/MessageItem.tsx` 用小图组件（约 ≤100px）；上下文反查 `messageFormat.stickerNameFromUrl` 把 URL 还原成名，避免 prompt 里塞长 URL。
- 用户侧同样可发表情；AI 侧“会用表情”是 prompt 可见性过滤 + 标记解析共同作用的结果。

### 3.4 语音 / HTML 卡 / 动作标签（摘要）

- **语音条**：prompt 教 `<语音 emotion="…">台词</语音>` + `<字幕>中文</字幕>` 成对写法；常规 AI 落库仍是 `text` 气泡，渲染层按标签剥出语音条，按需合成 TTS（另有转文字对照）；独立 `type: 'voice'` 仅用于收藏/生成的语音资产。清洗链含标签归一、去重、转写提取。
- **HTML 卡**：`[html]…[/html]` 提取 → 落库 `type: 'html_card'`（content 存摘要，`metadata.htmlSource` 存源码）→ 沙盒 iframe + `srcdoc` 渲染；开关关闭时降级占位文本。内置 prompt 约束尺寸/内联样式/禁 script。
- **动作标签族**（`parseAndExecuteActions` 清单）：`[[ACTION:POKE]]` → `interaction`；转账规范标签 → `transfer`（收/退补回执卡）；`[[MUSIC_ACTION:…]]` → `music_card`；`[[NEWS_CARD: 来源|标题]]` → `news_card`（本地热榜快照精确匹配优先，模糊多命中宁可不挂链）；`[[ACTION:ADD_EVENT|标题|日期]]` / `[schedule_message | 时间 | fixed | 内容]` → 日程与本地通知。方向为“标签在正文里声明、落库时剥离并产出结构化卡”，与切泡管线同一入口。

### 3.5 群聊与推送（摘要，不展开整机部分）

- 群聊 `GroupChat + utils/groupChat/` 两种回复模式：`director`（导演模式一次生成成员动作 JSON 数组 → 解析派发，各自再按行拆泡、表情、延迟、引用）与 `roundRobin`（每成员一次调用）。公共话题盒产出 `group_topic_card`。
- 推送分原生（Capacitor → 收件箱 → `flushInboxToChat` 重放同一分段管线）、Web（VAPID + 统一网关）、本地定时（轮询派发）三路；落库后跑与本地聊天一致的尾段管线。

## 四、与 Spherse 现状的对照

| 能力 | 对象 B | 对象 D | Spherse 现状 |
|---|---|---|---|
| 单次 AI turn 多气泡 | ✅ `messages[]` 数组 + 1500ms 逐条落库 | ✅ 换行切泡 + 500–2000ms 延迟 | ❌ 无切分协议；多气泡只在 tool 循环产出多条 assistant message 时附带出现（`entry-reducer` / `message-group.test`），一条 message 不可拆多泡 |
| 用户一次发多条 | ✅ Shift+Enter 暂存 + `join('\n')` 合并发送 | ✅ 同类暂存语义（以其输入区实现为准） | ❌ 输入框纯文本单发；无暂存列表 |
| 表情包 | 用户侧颜文字文本类型（AI 只见上下文） | AI/用户双侧图片类型（`emoji` + 按名解析） | ❌ 全仓无 sticker / 表情包 / reaction |
| 图片消息 | ✅ 独立 `image` 类型 + 上传识别状态机 | ✅ 独立 `image` 类型 + 相册链路 | 部分：用户单图 + 必带文本（多图只取首张，文件拒收）；AI 侧仅 `generate_image` 产 image card，assistant `ImageContent` 不展示；无纯图片消息 |
| 语音消息/通话 | ✅ 语音消息字段 + 通话视图 | ✅ 文本内语音标签 + 按需 TTS + 通话 App（落库仍为 text + source 标记） | ❌ 仅浏览器朗读；输入框无语音入口 |
| 引用/回复 | 弱：划选引用的词法游戏上下文为主 | ✅ `replyTo` 消息级 + `[[QUOTE]]` 解析挂首泡 | 弱：仅划选插入 `quoted` 代码围栏的文本引用，无消息级 `replyTo` / 线程 |
| 编辑/撤回/重发 | ✅ 按消息 ID 的重新生成 | ✅ 撤回/重发以其实现为准 | 弱：仅最后一条 user 消息“撤回整 turn + 重发”；streaming 中禁撤；压缩后不可撤；无单条删除 |
| 并行多回复/swipe | 未见（以其实现为准） | 未见 | ❌ 无；`retry` 仅失败可替换旧 turn |
| 同会话多角色 | ❌ 单角色会话（公司/群聊为独立玩法） | ✅ 群聊 director / roundRobin | ❌ 每 session 单 agent；`>>agent` summon 开新 session + 原会话留备注，非同会话群聊 |
| 快捷回复 | 游戏化指令面板（`QuickCommands`） | 各 App 自定义 | ✅ 但弱：agent 静态配置 ≤10 条，`fill` 动作只填入输入框（`QuickReplyBar`），无动态 AI 快捷回复 |
| 输入框能力 | 附件/布局可配/字数统计 | 以其实现为准 | 纯文本 + slash 补全 + 附件单图 + draft + token 估算 + 模型切换；无语音/富文本/拖拽粘贴上传 |
| 气泡表现层 | ✅ 换肤/延长图/多语言 label | ✅ 聊天细节微调（隐藏头像/贴边/缩进/字号行距等可视化开关） | ✅ agent `theme.css`（气泡/头像/输入框/markdown 图片钩子）；无可视化开关面板 |

Spherse 侧基线文件（均为仓库根相对路径）：`packages/core/src/index.ts`（内容块 `text/thinking/toolCall/image`）、`packages/app/src/features/chat/model/entry.ts`（四类 Entry）、`packages/app/src/features/chat/types.ts`（五类卡片）、`packages/core/src/session/events.ts`（会话事件）、`packages/app/src/features/chat/*`（`MessageList/AssistantBubble/MarkdownContent/HtmlCard/ImageCard/Composer/QuickReplyBar`）。

## 五、可吸收清单（按价值排序，均为提案，落地前需评审）

1. **多气泡分段（最高价值，通用机制；唯一出处见 `03 §九`，排期 v1.1.0）**：形态定为**渲染层切分**——模型按约定输出独占标记行，前端输出标记解析器切成多个子气泡（不动 wire / 持久化 / compaction；copy / 引用 / TTS 按子气泡持有各自文本，标记在读取边界剥离）。裸换行不得分泡（切碎代码块 / 表格 / 列表），只认显式标记 + 围栏保护。本条只解决“像人一样分段说话”的观感；结构化块渲染与分段共用同一 tokenizer，合并口径见 `03 §九`。
2. **消息 `type` 枚举 + 渲染 switch + 上下文反查（高价值，通用机制）**：先只加 `emoji/sticker` 与 `image` 的纯展示类型（文本存名/URL，渲染小图，上下文按名反查），不碰转账/音乐/日程等副作用卡。Spherse 现有 `text/thinking/toolCall/image` 内容块与五类卡片可直接扩展，不必另起系统。
3. **用户暂存多条一次发出（小而高价值，通用机制）**：`Shift+Enter` 暂存列表 + `Enter` 合并发送 + “已暂存 N 条”指示。wire 侧仍是一次请求，前端只做收集与拼接；AI 侧逐条翻译/对齐（如有）按换行拆分。
4. **消息级 `replyTo` + 单条操作（中等价值，需设计）**：引用回复、单条撤回/删除、按单条重发。Spherse 现只有整 turn 撤回，本条是 IM 完备性的常规补齐；与 compaction/分支语义有交互，须先明确“撤回是否改写历史真相源”。
5. **AI 快捷回复动态化（中等价值，Workspace 层）**：把现静态 `fill` 快捷回复扩展为“AI 按上下文建议的点选追问”，渲染归 UI，生成归辅助式短调用（与 `02 §七`、`03 §九` 的辅助式调用缺口是同一件事）。
6. **语音条只做“文本内标签 + 按需合成”（低优先级，垂直能力）**：复刻 D 式的取巧形态（落库仍是文本，渲染层剥标签），不引入独立 voice 类型与通话。不建议现阶段投入。
7. **气泡换肤/聊天细节微调（已具备，不吸收）**：agent `theme.css` + `[data-chat-root]` 下 `[data-chat-bubble]` / 头像 / `[data-chat-composer-input]` / `[data-md-img]` 等钩子已覆盖气泡、头像、输入框、markdown 图片样式（见 `spherse-create-agent-chat-theme` skill）。对象 B 的延长图 / 对象 D 的细节微调开关如需复刻，落预设层 CSS 即可。

## 六、明确不建议 / 不复用

- **不把双语对照/词汇标注/SRS/翻译老师做进聊天内核**：那是对象 B 的语言学习垂直能力（见 `02`），聊天侧只保留“多气泡容器”，内容是什么由 Workspace 决定。
- **不把转账/音乐/新闻/日程等副作用卡做进内核**：那是对象 D 的陪伴整机玩法（见 `04`），Spherse 侧已有 tool/卡片原语，真需要时由 Workspace 用现有卡片拼装。
- **不照搬群聊导演模式与整套推送体系**：前者是角色扮演的玩法取舍，后者依赖离设备 Worker + 推送网关（见 `04 §六` 真缺口 #2），两者都不在“聊天功能”范围内。
- **不抄代码、不搬 prompt 原文**：对象 D 许可为源码可见非开源；对象 B 源码只读引用。实现须独立，测试须自写（切泡的原子块保护、降级路径最值得先写测试）。

## 七、吸收裁决：内核 / HTML 定制 / 能力缺口

> 本节是 §五 的裁决版：只保留“通用工具该有的”，垂直玩法与已具备能力剔除；缺口按性价比排序，落点到包/文件级，仍为提案。

### 7.1 可吸收进内核（与 Workspace 无关，所有 agent 受益）

| # | 能力 | 为什么必须是内核 | 现状证据（仓库根相对路径） |
|---|---|---|---|
| A1 | **一次 turn 多气泡** | 只能用原生消息流表达；HTML 卡被沙箱关在单条气泡内，无法向流里追加气泡 | `packages/app/src/features/chat/model/message-group.ts` 每条 `AssistantEntry` → 恰好一个 Bubble；切分逻辑不存在 |
| A2 | **聊天气泡内 markdown 图片解析项目路径** | 贴图/插图/表情包的地基，通用能力 | `AssistantBubble.tsx` 调 `MarkdownContent` 时**没传** `resolveImageSrc`（`components/markdown-content/MarkdownContent.tsx` 有该能力），项目内相对路径在聊天里断图 |
| A3 | **消息级引用回复 / 单条删除重发** | IM 完备性；backlog 已有 R6.2 swipe、R6.3 删除 AI 回复 | R6.3 随 upstream merge 丢失，逐条语义未重落地 |
| A4 | **用户暂存多条一次发出** | 输入区语义；HTML 无法代劳（`sendMessage` 一次一条且会 `session_busy`） | `Composer` 纯单发；`runtime/outbound-actions.ts` 无暂存 |

A1 形态已定（见 `03 §九`）：**渲染层切分**——模型按约定输出独占标记行，renderer 切成多个子气泡，不动 wire / 持久化 / compaction；copy / 引用 / TTS 按子气泡各自持有文本，标记在读取边界剥离。裸换行不得分泡（切碎代码块 / 表格 / 列表），只认显式标记 + 围栏保护。A2 是最便宜的一击：一行 `resolveImageSrc` + 测试，即可让项目内图片在当前气泡内联显示。

### 7.2 HTML / Workspace 就能定制（不动内核）

| 能力 | 做法 | 是否够用 |
|---|---|---|
| 表情包图库、分类、按角色可见性 | `.data.json` 存清单 + `assets/stickers` 放图 + `uploadFile` 上传 + HTML 卡管理页 | ✅ 完全够 |
| 贴图“发送” | 依赖 A2（markdown 图）或 `render_card({file_path, width, height})` 出图卡 | ⚠️ 前者要 A2 落地；后者是“卡片”不是“气泡旁小图” |
| 动态快捷回复 / 建议 chips | HTML 卡按钮 → `spherse.sendMessage({sessionId, message, open:false})` | ✅ 今天就能做（静态快捷回复内核已有） |
| 自定义聊天面板 / 群聊 | `createSession` + `sendMessage` + `api.call("sessions.messages")` 读历史 + 自绘 UI | ⚠️ 只能轮询，无流式/推送（见 G3） |
| 收藏 / 翻译 / 标注 | `.data.json` 以 message 数字 id 为 key | ✅ 够（id 见 `sessions.messages.entries[].id`） |
| 气泡皮肤、头像、输入框样式 | agent `theme.css`（`[data-chat-bubble]` / `[data-md-img]` / `[data-chat-composer-input]` 等钩子） | ✅ **已有**，非缺口 |

### 7.3 真实能力缺口（按性价比排序，均为提案）

| 缺口 | 内容 | 层级 | 成本 |
|---|---|---|---|
| **G1** | 聊天 markdown 图片 `resolveImageSrc`（+ 可选尺寸约定） | app | 极小 |
| **G2** | 多气泡切分器 + 标记约定 + 围栏保护（= A1，`03 §九` 唯一出处，v1.1.0） | app（renderer） | 小 |
| **G3** | SDK `events.on("session:message" / "session:status")`：Workspace 自建聊天面板不再靠轮询 | sdk + app 桥 + server 事件面 | 中 |
| **G4** | SDK `composer.insert` / `setDraft`：贴图选择器、建议 chips 填入待发而非直接发 | sdk + app 桥 | 小 |
| **G5** | 用户多消息暂存（Shift+Enter）（= A4） | app | 小 |
| **G6** | 消息级 `replyTo`，替代 `quoted` 代码围栏 hack | contracts + core + app | 中 |
| **G7** | assistant 消息 `image` 内容块渲染：AI 发图/贴图成为气泡内原生内容而非卡片 | app | 小-中 |

建议顺序：G1 → G2 → G5 →（G4/G3 视 Workspace 需求）→ G6/G7。G1+G2 覆盖本次调研 80% 的“我们做不到”。

### 7.4 明确不吸收（重申，与 §六一致）

双语对照/词汇标注/SRS/信息卡、转账/音乐/新闻/日程等副作用卡、群聊导演协议、通话/TTS 管线、离设备推送、已读态——均可由 Workspace 用现有卡片/数据/trigger 拼装，进内核即重复投入。

## 八、方法、局限与范围

- 手段：对象 B 为本地源码只读精读（消息类型、prompt 模板、聊天视图、颜文字库、图片/语音组件）；对象 D 为仓库 shallow clone + `utils/chatParser.ts` raw 校验 + 既有 `04` 结论复用，未逐行审计 28 个 App；Spherse 侧为 `packages/core` 内容块/会话事件与 `packages/app` chat 渲染链路盘点。
- 局限：对象 D 的群聊/推送/通话只到“机制摘要”粒度；对象 B 的群聊式公司玩法、TRPG/小说/VN 视图未纳入；三方的具体 prompt 措辞、阈值数字（如延迟毫秒数）为实现细节，不作为吸收项。
- 范围：本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改任何 `docs/official/` 文档。
