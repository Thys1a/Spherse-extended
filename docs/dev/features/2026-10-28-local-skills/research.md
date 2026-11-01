# 本地 skill 发现与开关 — 调研

- 日期：2026-10-28
- 状态：现状调研完成，待澄清三处语义后定方案
- 来源：用户需求；调研约束：不读取用户本地 skill 目录（`~/.config/opencode/skills/` 等），以下结论全部来自本仓库代码
- 分支：`feat/local-skills-m7x2q`（自本地 dev 建出）

## 一、需求重述

1. 发现用户机全局 skill 目录（`~/.config/opencode/skills/`、codex、`~/.claude/skills/`、`~/.agents/skills/` 等），在设置里列出并可开关，默认全部关闭，项目 skill 优先；
2. agent 增加项目 skill 列表，默认全部开启。

## 二、现状（代码实情）

### 1. skill 来源与优先级（已齐四层，无用户级）

`SkillStore`（`packages/core/src/store/skill.ts:36-87`）：`list()` 按 builtin → `additionalSkillDirs` → `skillDir` 顺序后写覆盖；`get()` 按 `skillDir` → `additional` → builtin 顺序命中。

- builtin：`PRESET_SKILL_SOURCES`（`@spherse/presets`，内存合并，不落盘）；
- `.agents/skills`：`additionalSkillDirs`（`project.ts:71-76,98-103`，open/create 两处硬编码）；
- `.spherse/skills`：`skillDir` 主目录；
- agent 级：`agentStore.skills = SkillStore(agentDir/skills)`（`agent-store.ts:93-97`），独立 store，无 builtin、无 additional。

既定优先级（`packages/presets/skills/spherse-guide/SKILL.md:121`、`spherse-create-skill/SKILL.md:27`）：agent-level > `.spherse/skills` > `.agents/skills` > builtin。

### 2. 消费路径（无任何过滤点）

- `skillCapability`（`packages/core/src/capabilities/skill/index.ts`）：`load_skill` 工具按 agent → project 顺序回退（`tools/load-skill.ts:23-25`）；`<skill-catalog>` 上下文块塞入**全部**项目 skill 名+描述再叠加 agent skill（同名后写覆盖，`:18-39`），无开关、无白名单；
- `/skill:name` 快捷写法走同一 get 链（`core/src/session/slash.ts:68-70`）。

### 3. 开关机制现状：零

`AgentProfile` 无 `skills` 字段（`core/src/types.ts:30-54` 只有 `tools`）；全仓库无 `enabledSkills`/`disabledSkills` 概念；server `routes/skills.ts` 只有 list/get/create/install，无 toggle；`Skill Panel`（`app/src/features/skill-panel/`）只管理 `.spherse/skills` 主目录（创建/安装/市场）。

### 4. 设置面与用户级存储

- 设置 UI = `SettingsModal`（`app/src/features/settings/index.tsx`，tabs 结构）；
- 桌面持久化 = electron-store `settings.json`（`desktop/electron/settings.ts:39-41`，`hostPrefs` 等节）；**无任何用户级 skill 配置**；
- web 壳无本地 FS：用户级目录方案天然 desktop-only，需降级策略。

### 5. 安全与路径约束

- companion files 由 agent 经 `read_file` 按相对路径读取（`slash.ts:76-83`、`load-skill.ts:39-45`），`read_file` 只认项目根内路径；用户级目录在项目沙箱外，直接复用现有路径会走默认拒绝；
- SKILL.md 解析已有防护（name/description 必填、目录名一致校验、zip 路径穿越校验，`store/skill.ts`），新来源可复用同一套。

## 三、可行性与影响面

改动按层（均向后兼容、可独立合入）：

1. **core/store**：`SkillStore` 新增 user-level 目录源（构造参数或独立 store 实例），`SkillDefinition.source` 加 `"user"`（`types.ts:58-66`，contracts 侧 `skillDefinition` schema 需同步加枚举值）；
2. **core/capability**：catalog 注入与 `load_skill`/`slash` 增加“启用集合”过滤；
3. **agent 模型**：`AgentProfile` 新增 skill 列表字段（allowlist vs denylist 待定，§四），`manage_agent` 是否透传待定；
4. **server**：skills routes 增 list（含来源标注）/toggle 端点，或复用 IPC+bridge 走本地（见 §四选项）；
5. **app**：设置里新增用户 skill 区（开关列表，默认全关）；Agent Dialog 新增项目 skill 区（默认全开）；Skill Panel 是否合并展示待定；
6. **i18n**：新增文案走 **i18n** skill 三语同步。

## 四、方案方向

- **用户级目录接入**：推荐复用 `SkillStore` 的 `additionalSkillDirs` 机制（只读扫描 `SKILL.md`，不写回），排序放在 builtin 之上、`.agents/skills` 之下（项目永远优先，符合“优先项目 skill”；builtin 最低是现有惯例的自然延伸）。
- **开关语义**：用户级默认全关（显式 opt-in，与“外部内容进 prompt”的谨慎原则一致）；agent 侧项目 skill 默认全开（现状行为不变，只是把“全开”显式化为可配置）。
- **开关状态存储二选一**：(a) desktop `settings.json` 新增节（本机维度，server 侧按机器生效，web 壳降级隐藏）；(b) server 侧用户配置文件（跨壳一致，但 web 壳读不到本地目录，仍需降级）。推荐 (a)。
- **companion files**：默认只进 instructions/catalog（零路径改动）； companion 按需读取需另设 access policy 豁免或“导入成本地副本”动作，本期建议不做。

## 五、待澄清（阻塞设计）

1. agent 的“项目 skill 列表”是 allowlist 字段（缺省=全开）还是 denylist（`disabledSkills`）？覆盖范围仅项目 skill（含 `.agents/skills`），还是连用户级的一并管？
2. 开关状态存 desktop `settings.json`（本机生效）是否可接受？web 壳是隐藏该区还是只读展示？
3. 用户 skill 是否只要 instructions 进 catalog/load，companion files 本期不做？

## 六、已决策（2026-10-28，用户确认）

1. agent 侧用 allowlist 字段 `skills?: string[]`，缺省/空 = 全部项目 skill（含 `.agents/skills` 兼容目录）；用户级 skill 不进该字段，只走全局开关；
2. 开关状态存 desktop `settings.json`（本机维度），web 壳隐藏该区；
3. companion files 允许 `read_file` 读取用户 skill 目录（access policy 加显式只读豁免，作用域限定已发现的 skill 根目录，需安全评审）。
