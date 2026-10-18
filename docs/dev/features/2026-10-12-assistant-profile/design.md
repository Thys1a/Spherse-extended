# 小助手初始 profile 提问约定：方案

- 日期：2026-10-18
- 状态：有方案，待评审（待定措辞终稿，见 §四）
- 版本：v1.0.1
- 来源：排期总览（用户直接提出）+ 本次代码现状核查（只读，未改代码）

## 一、结论摘要

1. 改一处：`packages/presets/templates/preset-agents/assistant.md` 正文追加独立段落（放文件末尾独立段，不进 frontmatter；不拆散现有自我介绍 + 技能两行），落点为默认 profile 模板，不碰新建 agent 引导（`templates/agent-template.md` 是空白对话框模板，两回事）。
2. 只影响新建项目：copy-on-create，无存量迁移（已决策锁定）；存量 `.spherse/agents/*/profile.md` 不会被动改写。
3. 约定只属小助手：放 `assistant.md`，不进 `spherse-guide`（后者影响所有加载该技能的 agent）。
4. 措辞锁定现稿（§三引用块，已确认）。
5. 不走 i18n：profile 是 LLM-facing prompt（`presets/README.md:46-47`），中文硬编码即可。
6. 改后必须重跑 presets 构建再生 `PRESET_AGENTS`，否则 `sync-templates.test.ts` 挂。

## 二、现状（file:line 实证）

- 单一真相源：`preset-agents/assistant.md:1-32`（frontmatter `name: 小助手` + 24 项 tools 含 `ask_user`，正文仅 2 行：自我介绍 + 加载 `spherse-guide` 技能）。
- 打包链：`presets.json:13-15` 声明 → `scripts/sync-templates.mjs:35-53` 读全文打包 → `src/generated/presets.ts`（gitignore，构建再生）→ `src/index.ts:4` 导出。
- 消费链：`core/src/presets.ts:14-16`（`initPresets`）← `factory.ts:84-87`（仅 `isNewProject` 即 `open()` 抛 `ProjectConfigNotFoundError` 时触发）→ `store/project.ts:193-209` 落盘独立目录（`slug=slugBase+shortId`）。
- 测试：`core/__tests__/presets.test.ts:35-72` 只断言数量/name/slug 正则/非空/tools 白名单，加一句话不挂；`presets/__tests__/sync-templates.test.ts:42-53` 要求 generated 与模板全文一致，改后重构建即过。

## 三、方案

1. `assistant.md:30` 后追加约定段落（独立段，不进 frontmatter；`ask_user` 工具已启用，有执行支撑）。建议终稿（待你一句话确认）：
   > 先计划，后执行：有疑问先提问澄清；动手前先给出计划，经确认后再执行。
2. `npm run build --workspace=@spherse/presets`（或根 `npm run build`）再生，再跑 `npm test --workspace=@spherse/presets --workspace=@spherse/core`。
3. 本目录 README「落点待定」落定为默认 profile 模板。

## 四、已决策（2026-10-18）

- 方向：措辞简洁精准，核心意图是约束模型先 plan 再 build（有疑问先问、动手前先给计划并经确认）。
- 建议终稿见 §三步骤 1 引用块，待你一句话确认后即按此落字。
- 是否同时改新建 agent 引导：不改（空白模板无正文可依，且与“小助手预设”是两个东西）。

## 五、测试

- `presets` + `core` 上述两单测通过；新建项目一次性验证小助手 profile 含新句（真机一次即可）。

## 六、范围与不做

- 不做存量迁移（先例 `2026-09-15-card-json-app-layer/design.md:283`：模板只惠及新建）；不加 i18n key；不手改 `src/generated/`/`dist/`。
