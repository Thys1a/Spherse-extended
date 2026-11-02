# agent 编辑技能区改版 — 方案设计

- 日期：2026-11-01
- 前置：`research.md`（同目录；可行性“纯 app 层约 1–1.5 天”）
- 范围：第三 tab＋三段分隔折叠；删除同步 bug 按 `bugfix/2026-11-01-skill-delete-stale-names` 结论不做

## 一、语义

- Agent Dialog 新增第三个 tab（skills），现有 `AgentSkillsField` 整体搬入；basic/personalization 不动。
- 组内按来源拆三段：builtin（`source === "builtin"`）/ project（`source === "project"`，含 `.agents/skills` 兼容目录，不再单列）/ user（`source === "user"`，即全局已启用的）。
- 每段独立折叠（默认展开，空段不渲染）；折叠态为纯 UI state，不进 profile。
- **状态提升（关键）**：builtin 与 project 同属 `skills` 名单——两段必须共享同一份 `checked`/`toggle`，折叠判定基于**两者并集**。禁止给 builtin 组配独立 value，否则“全选→undefined”判定用各自子集会误折叠。
- builtin 走 `value` 剪枝路径，不设 `preserveHidden`（builtin 永不“暂时消失”，与 user 段语义不同）。
- 早返回判定含 builtin：三段都空才返回 null，否则“只有 builtin”的 agent 在 skills tab 看到空白页。
- user 段维持现状（独立 `userValue`、`preserveHidden`、`absentMeansAll={false}`）。

## 二、改动

- `AgentDialogForm.tsx`：`TabsList` 加 `TabsTrigger value="skills"`（`:154-157` 旁）；新建 `TabsContent value="skills"`，把 `:244` 的 `AgentSkillsField` JSX 原样搬入（props 不变）。
- `AgentSkillsField.tsx`：`useFoldedToggle` 上提到 `AgentSkillsField` 层，对 project＋builtin 并集计算一次；`SkillToggleGroup` 改为受控展示（收 `checked`/`toggle`，不再内部建 hook）；三段各包 `components/ui/collapsible.tsx`（builtin 段默认折叠，project/user 段默认展开；折叠态不持久化）。
- i18n：`agent-dialog.tabSkills`、`agent-dialog.builtinSkillsLabel`、`agent-dialog.builtinSkillsHint`，三语同步。
- 删除同步：不做（见 bugfix research）。

## 三、测试

- Form：tab 切换到 skills 显示 Field（仿 `AgentDialogForm.test.tsx:237` 的 tab 点击模式）。
- Field：三段渲染与空段隐藏（含“只有 builtin”不空白）；builtin 开关参与项目组折叠（全关两段→`undefined`，含 builtin 名；缺一→显式数组）；user 段既有 4 条用例全保留。
- markdown：零改动（字段语义不变）。

## 四、不做的事

- 单列 `.agents/skills`（与 project 同 `source`，展示层不再细分）。
- skill 删除 prune（见 bugfix research）。
- server/contracts：零改动。
