# 用户 skill agent 默认关闭 — 可行性调查

- 日期：2026-10-29
- 目标：全局开启后，agent 级别默认为关闭（需逐个手动开启），项目 skill 保持默认全开。
- 结论：已采纳并审查通过，进入实施。属**破坏性语义变更**（见 §三），但仅影响未发布的 dev 构建——`userSkills` 只存在于未发布的 v1.0.3，已发布版本无此字段，无需数据迁移。

## 一、现状：缺席＝跟随全局

`userSkills === undefined` 在 6 处被当作全开：`isUserSkillAllowedForAgent`（`store/skill.ts:50-56`，catalog/`load_skill`/slash/`read_file` 四路唯一 choke 点）、Dialog `checked`（`AgentSkillsField.tsx:18`）、两组共用的折叠（全选→`undefined`）、`manage_agent` 全量折叠删字段、markdown 缺席不写、`summarize` 回显 `?? null`。

## 二、改法：缺席即全关（Option 1，唯一推荐）

- `isUserSkillAllowedForAgent`：`undefined` 返回 false（`[]` 同义）。四路判定同步翻转，无需逐处改。
- `AgentSkillsField` 用户组：`useFoldedToggle` 加 `absentMeansAll` 参数，用户组传 false——`checked` 缺席为 false、`base = value ?? []`（**不是 `allNames`**，否则点一个开关会反转为全开）、**永不折叠为 `undefined`**（全选写显式数组）；项目组传 true 维持现状。`preserveHidden` 保留给用户组。
- `manage_agent` user 侧三处同步翻：`resolveSkillAllowlist` 加 `fold` 参数（project=true / user=false）；`summarize` 的 `null` 含义变为全关，工具描述重写；`create` 描述补“省略 `userSkills`=全关”（与 `skills` 省略=全开对比说明）。
- `agent-markdown`：解析/写回不动（无缺省逻辑）。
- i18n：`userSkillsHint` 三语改“默认关闭，需逐项开启”；`skillsHint` 补“项目技能默认全部启用”（两组默认值相反，同屏需直说）。
- contracts：schema 不动（仍是可选数组）。

## 三、破坏性与取舍（必读）

1. **既有 agent 立即失去用户 skill**：凡 `userSkills` 缺席的 agent，下次 reload 后全局 skill 全部不可见。无法迁移（“从未配置”与“跟随全局”是同一状态，不可区分）。仅影响 dev 构建使用者（已发布版本无此字段）；缓解靠 `Changes.md` 行为变更声明＋用户逐个重勾。
2. **“跟随全局新增”彻底消失**：以前显式选择后才失去跟随，现在缺席即全关——未来全局新开的 skill 永不自动出现，必须逐 agent 勾选。这是“默认关闭”的字面代价，无中间态可选（`undefined` 只有一种含义）。
3. **连带**：`read_file` 对未配置 agent 同步失去 companion 读取（同一谓词，语义一致，应在 design §一记一句）。
4. 否决 Option 2（仅新 agent 默认关）：新旧在 `profile.md` 上无任何可区分标记，只能按创建时间硬分叉，复杂度与隐式规则不可接受。

## 四、工作量

约半天：core 谓词 1 行＋Field（`absentMeansAll` 参数化）＋`manage_agent` user 三处＋i18n 三语；测试改动面大（`skill` 缺席用例、`load-skill` 无名单用例、`slash` 无 profile 用例（`:192`  companions 路径测试需补 `getProfile`）、`fs` 跟随用例、`manage_agent` user 折叠用例、Field 缺席/全选/折叠用例全部反转断言）；`Changes.md` 行为变更声明；design-agent-user-skills.md §一§二§四§七同步；`data-conventions.md` 补 `userSkills` 行（上一轮 doc-sync 漏了）。
