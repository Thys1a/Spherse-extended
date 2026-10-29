# Agent 纬度开关用户级 skill — 可行性调研

- 日期：2026-10-29
- 状态：已决策 AND（全局是总闸）＋缺席跟随全局＋UI 只列已启用＋`read_file` 不跟进，可进 design
- 约束：只读仓库代码，未读取任何用户本地 skill 目录
- 目标：设置里全局开启的 skill，能在 agent 编辑里按 agent 单独开关，不影响别的 agent
- 前提：推翻现决策（design.md“白名单只管项目侧”＋research §六“用户级不进该字段，只走全局开关”）

## 一、现状（代码实情）

- 三路对 user 一律直通：catalog（`capabilities/skill/index.ts:25`）、`load_skill`（同文件 `:16-18`）、`/skill:`（`session/slash.ts:72-77`）。
- Agent Dialog 只取项目 skill：`useProjectSkills` 用 `?scope=project`（`queries/skills.ts`），`AgentSkillsField` 再 filter `source !== "user"`（`:16`）。
- `manage_agent` 的 `resolveSkillAllowlist` 拒绝一切 user 名（`tools/manage-agent.ts`，`listProjectSkillNames` 先 filter 掉 user）。
- `get.availableSkills` 同样不含 user 名。
- `read_file` 外部白名单只看全局 `enabled` 目录（`tools/read-file.ts:43-63`），与 agent 无关。

## 二、方案 B1：新增 `profile.userSkills?: string[]`（唯一推荐，其余见 §四）

判定：`visible = globalEnabled(name) AND (userSkills === undefined || userSkills.includes(name))`（AND 版）或 `visible = globalEnabled(name) OR userSkills?.includes(name)`（OR 版），详见 §三。三处直通改为调新函数，其余不动。

改动面：

- core：`types.AgentProfile` 加 `userSkills`；`agent-profile.ts` 解析（仿 `skills`，非数组视为未设置）；`store/skill.ts` 加 `isUserSkillAllowedForAgent`（旧函数不动）；capability 三处接线；`manage_agent` 加第二参数（可分期，先拒绝 user 名并提示用新参数）。
- contracts：`agentProfile` 加 `userSkills`。
- app：`AgentSkillsField` 加“全局 skill”分组（只列全局已启用的；数据源从 `scope=project` 改回全量，client 侧再分——服务端隔离初衷是“Dialog 只取项目 skill”，改动后需重审）；`agent-markdown` 解析/写回（仿 `skills`：缺席全开、`[]` 全关）；i18n 三语。
- server：零改动（全局开关与存储不动）。
- 测试：三路一致性（catalog/`load_skill`/slash 对同一 agent 同一 user skill 同隐同显）、缺席兼容（旧 agent 行为不变）、同名（项目副本优先，详见下）、round-trip。

## 三、关键语义（待拍板，见文末问题）

1. **AND vs OR**：AND＝全局是总闸，关即全不可见；单开一个 agent 需给其余 N-1 个写 `[]`（O(N)）。OR＝名单即特批，全局关也能单开；单开 O(1)，但“全局关”不再保证不可见。
2. **缺席语义**：两种都取缺席＝跟随全局（全开已启用的），旧 agent 行为零变化。无争议。
3. **同名**：用户 skill 与项目 skill 同名时 `list()` 只剩项目副本（覆盖），白名单按名匹配作用于显示项——关即显示项消失（用户副本本就被压住），开即显示项目副本。简单且可解释，写进 design 即可。
4. **UI 名单范围**：Dialog 只列全局已启用的 user skill（关闭的不列，避免 agent 存“未来生效”的脏名）。无争议。
5. **`read_file` 跟不跟**：建议不跟（仍按全局 `enabled`）。后果：agent 关掉 X 后，模型若已知绝对路径仍可读 X  companion——路径只经 `load_skill` 输出（关后不可见），靠“不可见即不可达”止血。跟进则每次 `read_file` 加 agent 判断，成本 +1，收益低。

## 四、否决的备选

- **B2 复用 `skills` 字段纳 user 名**：`["research"]` 是否顺带关掉全部 user skill？一旦 agent 写过部分项目名单，全局 skill 被静默掐掉——灾难性歧义。否决。
- **B3 全局面板按 agent 配矩阵**：N×M 矩阵 UI＋server 语义，复杂度远超 B1。否决。
- **C 导入为副本**：design 早已“本期不做”，同步/写回/去重全是坑。否决。
- **D 改 source 标注**：优先级、同名覆盖、安全审计全依赖 `source`，改标注等于埋雷。否决。

## 五、结论

B1 技术无阻塞，约 1–2 天（含测试＋i18n＋design 更新：design.md 白名单节、data-conventions `skills`/`userSkills` 行、glossary）。唯一真决策是 AND / OR。
