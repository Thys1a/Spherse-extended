# Agent 纬度开关用户级 skill — 方案设计

- 日期：2026-10-29
- 前置：`research-agent-user-skills.md`（方案 B1，AND 语义已决策）
- 推翻旧决策：design.md“白名单只管项目侧”＋research §六“用户级不进该字段”——本文生效后以本文为准
- 范围：只做 B1（含 `read_file` 按 agent 过滤，见 §一）；冻结集合不提供

## 一、语义

- 新增 `AgentProfile.userSkills?: string[]`，只管用户级（`source === "user"`）skill。
- 可见性：`visible(name) = globalEnabled(name) AND (userSkills === undefined || userSkills.includes(name))`。
  - 缺席＝跟随全局（全开已启用的）：旧 agent 行为零变化。
  - `[]`＝该 agent 关闭全部用户 skill；子集＝只用这几个。
  - 全局关闭 ⇒ 全不可见（总闸），agent 名单写了也无效。
- 同名：`list()` 同名覆盖后只剩项目副本，白名单按名匹配作用于显示项——关即显示项消失，开即显示项目副本；`read_file` 仍按 user 名单放行用户副本目录（已知局限：需事先知道绝对路径才可达，关闭显示项后新路径不再输出）。
- Dialog 名单范围：只列全局已启用的 user skill（关闭的不列，不存“未来生效”脏名）。
- `read_file` 按 agent 过滤：`externalReadRoots` 改为全局已启用**且**当前 agent 允许的目录；agent 关闭某 skill 后即使历史 tool result 留有绝对路径也拒绝。AND 闸是结构性成立的（`list()`/`get()` 本就不返回未启用的用户 skill），新判断函数只做减法，不叠全局判断。

## 二、core

- `types.ts`：`AgentProfile` 加 `userSkills?: string[]`。
- `store/skill.ts`：加 `isUserSkillAllowedForAgent(profile, name): boolean`（`profile?.userSkills === undefined || includes`），旧 `isSkillAllowedForAgent` 不动。
- `store/agent-profile.ts`：解析仿 `skills`（字符串数组才认，否则视为未设置）。
- `capabilities/skill/index.ts` 三处 user 直通改为新判断：
  - catalog：`s.source !== "user" || isUserSkillAllowedForAgent(view.profile, s.name)` 才列入。
  - `load_skill` 回调：同上。
- `session/slash.ts`：`projectSkill.source === "user"` 分支追加 `&& isUserSkillAllowedForAgent(agentProfile, name)`。
- `capabilities/fs/index.ts`：`externalReadRoots` 改为 `(await projectStore.skill.listUserSkills()).filter(按当前 profile 允许).map(取目录)`。
- `tools/manage-agent.ts`：
  - `ManageAgentParams` 加 `userSkills`（描述复用 §一规则，注明与 `skills` 分管项目/用户两侧；注明全局已关闭的 skill 不会出现在合法名单里）。
  - `resolveSkillAllowlist` 加 `scope: "project" | "user"` 参数：user 侧合法名单＝`list()` 中 `source === "user"` 的名字；全量折叠、空数组语义与项目侧一致。
  - `summarize` 加 `userSkills: profile.userSkills ?? null` 同形回显；`get` 的 `availableSkills` 改为 `{ project: string[], user: string[] }` 对象（`list` 不加）。
  - 脏值修复仿 `skills`（非数组即删）。

## 三、contracts

- `agents.ts`：`agentProfile` 加 `userSkills: Type.Optional(Type.Array(Type.String()))`。

## 四、app

- `queries/skills.ts`：**不动** `useProjectSkills`（Composer 菜单、MarketplaceDialog 依赖项目 scope）；新增 `useAllSkills`＋独立 query key，只给 Agent Dialog 用。
- `AgentSkillsField`：现有项目组不动；新增“全局 skill”分组，只渲染 `source === "user"`（即全局已启用的）user skill，开关写 `userSkills`（缺席↔全选折叠规则与项目组一致）；早返回改为两组都空才返回 null。
- `agent-markdown.ts`：解析/写回 `userSkills`，规则同 `skills`（缺席全开、`[]` 全关、全量折叠删字段）。
- i18n：新增分组标题/提示文案，三语同步。

## 五、server

零改动（全局开关、存储、路由、`markAllSessionsReloadPending` 全部沿用）。

## 六、不做的事

- “冻结当前集合”（全量名单恒折叠为全开，未来 skill 自动加入）。
- `/skill:` 补全菜单不列用户 skill（菜单走项目 scope；服务端放行，可手打）。
- 全局面板的按 agent 矩阵（B3）。
- 用户 skill 导入为项目/agent 副本（C）。

## 七、测试

- core：三路一致性（同一 agent＋同一 user skill 在 catalog/`load_skill`/slash 同隐同显）；缺席兼容（无字段 agent 在全局开/关下行为与现状一致）；AND（全局关＋名单含＝不可见，结构性成立）；`[]` 全关；同名穿透（项目副本受控、用户副本仍被压住）；关闭后 `read_file` 拒绝该 skill 目录；`manage_agent` user 侧 round-trip／拒绝／折叠；`agent-profile` 非数组→未设置。
- contracts：`userSkills` 正/负向。
- app：Field 两组渲染与折叠（全选↔缺席）、只有用户组时的渲染、markdown round-trip（`Composer`/`MarketplaceDialog` 仍走项目 scope，以 grep 为证，不补回归测试）。
- `manage-agent.test.ts` 既有 3 条 `availableSkills` 数组断言改为新对象形状。
- server：无新增（现有路由测试覆盖全局开关）。

## 八、文档同步（实现后）

- design.md 白名单节改“`skills` 管项目侧、`userSkills` 管用户侧”；data-conventions Agent 表加 `userSkills` 行、Skill 节补 agent 纬度一句话；glossary 无需动（四层不变）。
