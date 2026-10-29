**方案：manage_agent 管理项目 skill 白名单**

## 决策权衡

| 决策点 | 结论 | 依据 |
|---|---|---|
| D1 自授权 | 沿用审批，不加额外限制 | create/update 已经过 `withApproval` 审批闸（`capabilities/agent-mgmt/index.ts:9-13`）。skill 只注入说明文本，授予不了任何工具，所以风险低于已经开放的 `tools` 自加。yolo agent 会绕过审批（`session/agent-assembly.ts:157`），这一点与 `tools` 相同，不单独处理。 |
| D2 未知名 | 拒绝，报错信息附上合法名单 | 与 `validateTools` 做法一致。模型拿到名单后可以自行纠正，拼错的名字也能当场暴露。 |
| D3 回到全开 | 不加新语法，传完整名单即可 | 按你选的语义，完整名单存成“缺省=全开”，和 Agent Dialog 全选时不写字段的行为一致。 |
| D4 create 支持 skills | 支持 | 只多一个参数。省略时不写字段，即全开。这一点与 `tools` 不同：`tools` 在 create 时缺省写 `[]`。 |

## 实现（只改 `packages/core/src/tools/manage-agent.ts`）

1. **新参数** `skills: Type.Optional(Type.Array(Type.String()))`。描述写清楚：
   - 全量替换，省略表示不改。
   - 只接受项目 skill 名。
   - `[]` 表示全部关闭。
   - 传入全部项目 skill 名时恢复全开，以后新增的 skill 也会自动启用。
   - agent 级 skill 和用户级 skill 不受这个列表约束。
2. **新函数** `resolveSkillAllowlist(names, projectStore): Promise<string[] | null>`，返回 `null` 表示全开：
   - 先去重。
   - 空数组直接返回 `[]`。这一步放在最前面，所以项目里没有任何 skill 时，`[]` 仍然表示全关。
   - 合法名单是 `projectStore.skill.list()` 里 `source !== "user"` 的名字。用户 skill 和项目 skill 同名时，`list()` 返回的是项目那个，所以能通过。
   - 有未知名时抛 `ValidationError`，信息格式为 `unknown skill name(s): x. Project skills: a, b`。agent 级 skill 的名字也会被拒，信息里补一句“agent 级 skill 不受白名单约束”。
   - 去重后正好等于全部项目 skill 时返回 `null`，否则返回名字数组。
3. **写入**：只在 `params.skills !== undefined` 时执行。
   - create：结果为 `null` 就不写字段，否则写数组。
   - update：结果为 `null` 就 `delete frontmatter.skills`，否则写数组。
   - update 且未传 `skills` 时，若既有 `frontmatter.skills` 非数组则删除（修脏值到全开）。
4. **回显**：
   - `summarize` 增加 `skills: profile.skills ?? null`，`null` 明确表示全开（`JSON.stringify` 会丢 `undefined`，直接回显会让模型误判）。list 和 get 都会显示。
   - get 额外返回 `availableSkills`（项目 skill 名单，按名排序）。list 不返回，免得每次 list 都扫一遍目录。
5. **工具总描述**：在 `:250` 的字段清单里加上 “project skill allowlist”。

## 测试（加到 `manage-agent.test.ts`）

- get 能回显 `skills` 和 `availableSkills`；未设置时 `skills` 为 `null`。
- create 带部分名单时写入数组；不带时不写字段。
- update 传部分名单时写入数组，再读回结果一致。
- update 传 `[]` 时写入 `skills: []`。
- update 传完整名单时删除字段，即恢复全开。
- 未知名被拒，报错信息里有合法名单。
- 用户级 skill 名被拒；与项目 skill 同名的则能通过。
- 省略 `skills` 时原字段保持不变。

不改 contracts，没有持久化格式变化，不涉及 i18n。

## 同步清理（实现时一起做）

- `design.md` 里“`manage_agent` 不管理这个字段”和“本期不做……`manage_agent` 管理白名单”两处要更新。
- `research-manage-agent-skills.md:47` 有一段残留文字“`skills: null` shoot？”，要删掉。
