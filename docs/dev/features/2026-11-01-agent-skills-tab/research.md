# agent 编辑技能区改版（第三 tab＋分段折叠）— 调研（2026-11-01）

- 目标：Agent Dialog 在 basic/personalization 之外新增 skills 专属 tab；组内按来源（内置/项目/用户）分隔、三段可折叠。
- 结论：可行，纯 app 层中小改动，约 1–1.5 天（含测试）。

## 一、代码现状

- `AgentDialogForm.tsx:153-156`：仅 basic/personalization 两个 tab；`AgentSkillsField` 塞在 basic tab（`:244`），含项目组（`skills`）与用户组（`userSkills`）两段。
- 分组数据齐备：`SkillSummary.source` 含 `builtin`，Dialog 取数走 `useAllSkills` 全量列表，分组无需后端改动。
- i18n 有 tab 键先例（`agent-dialog.tabBasic/tabPersonalization`）；组件测试模式现成（`AgentSkillsField.test.tsx`）。

## 二、可行性

- 新增第三个 `TabsTrigger/Content`（如 `skills`），把 `AgentSkillsField` 整块移入；空态（两组都空）沿用现有 early-return。
- 组内拆三段：builtin / project（含 `.agents/skills`，`source` 均为 `project`，如需单列 `.agents` 要看 filePath 前缀，属展示细节）/ user，每段配折叠容器（`<details>` 或既有折叠组件）+ 计数。
- 折叠态为纯 UI state，不进 profile；i18n 加 tab 键＋三段标题（三语）。
- 删除同步 bug 见 `docs/dev/bugfix/2026-11-01-skill-delete-stale-names/research.md`——结论为接受现状，本改版不含 prune 逻辑。

## 三、影响面

- app only：`agent-dialog/`（Form + Field + i18n + 组件测试）。不动 core/contracts/server。
- 回归点：现有 Field 行为测试（折叠规则、缺席语义、隐藏名保留）全部保留；新增 tab 切换与分组渲染用例。
