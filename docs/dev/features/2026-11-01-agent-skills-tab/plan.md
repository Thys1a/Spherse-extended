# plan：agent 编辑技能区改版（第三 tab＋三段分隔折叠）

- 对应设计：同目录 `design.md`（审查通过，待实施；删除同步 bug 见 `bugfix/2026-11-01-skill-delete-stale-names`，不在本文）

## 任务（按序，前者是后者的前置）

### 1. 状态提升：`AgentSkillsField.tsx`

`useFoldedToggle` 上提到 `AgentSkillsField` 层，对 project＋builtin 并集（`source !== "user"`）计算一次；`SkillToggleGroup` 改为受控展示（收 `checked`/`toggle`，删内部 hook 调用）。project 组参数不变；user 组保持 `preserveHidden` + `absentMeansAll={false}`；早返回判定含 builtin（三段都空才返回 null）。

- verify：`npm test --workspace=packages/app -- src/features/agent-dialog/AgentSkillsField.test.tsx`（既有折叠/剪枝/隐藏保留用例全绿；新增“只有 builtin 不空白”）。

### 2. 三段分隔折叠：同文件

`SkillSummary.source` 分三段：builtin（`=== "builtin"`）/ project（`!== "user" && !== "builtin"`）/ user；各包 `components/ui/collapsible.tsx`（builtin 默认折叠，project/user 默认展开；折叠态本地 state 不持久化）；空段不渲染。

- verify：同上（新增三段渲染、空段隐藏、builtin 开关参与项目组折叠：全关两段→`undefined` 含 builtin 名）。

### 3. 第三 tab：`AgentDialogForm.tsx`

`TabsList` 加 `TabsTrigger value="skills"`（`:154-157` 旁）；新建 `TabsContent value="skills"`，把 `:244` 的 `AgentSkillsField` JSX 原样搬入（props 不变：`skills={allSkills}`、`value`/`onChange`、`userValue`/`onUserChange`）。

- verify：`npm test --workspace=packages/app -- src/features/agent-dialog/AgentDialogForm.test.tsx`（新增 tab 点击切到 skills 显示 Field，仿 `:237` 模式）。

### 4. i18n：`agent-dialog.tabSkills`、`builtinSkillsLabel`、`builtinSkillsHint`

三语同步（走 i18n skill）；`TranslationKey` 编译期约束。

- verify：`npm run check:i18n`（或 `npm run verify` 链内覆盖）。

### 5. 收尾门

- verify：`npm run lint`、`npm run build` 后 `npm run typecheck`、`npm test --workspace=packages/app`；合并前 `npm run verify:e2e`（按影响面选 Agent 对话框相关 spec）。
- 验收：design §一逐项通过（第三 tab 可达、builtin/项目共享折叠判定、user 段语义不变、折叠态不进 profile、无 server/contracts 改动）。
