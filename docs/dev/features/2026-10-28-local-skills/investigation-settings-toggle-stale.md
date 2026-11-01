# 设置开关后 Agent 侧残留已关闭 skill — 调查与修法

- 日期：2026-10-29
- 现象：全局设置里打开某用户 skill 又关闭后，Agent 编辑里依旧能看到它且开关为 ON。
- 期望语义（已确认）：行不显示；下次全局重新开启时，恢复该 agent 上次的打开/关闭（即 agent 的 `userSkills` 选择被记住，关闭期间跟随全局不启用）。

## 一、根因（renderer 缓存，无人失效）

1. 生产 `QueryClient` 配了 `staleTime: Infinity`（`packages/app/src/queries/client.ts:10`），`useAllSkills`（`queries/skills.ts:13-18`）无覆盖——取过一次全量名单后，重开 Dialog 也不重取。
2. `UserSkillsPanel.save`（`features/settings/UserSkillsPanel.tsx:35-49`）只 `setSettings(res)` 更新自己；`invalidateProjectSkillQueries` 仅 `MarketplaceDialog` 在用，设置保存路径零失效、零 bus 通知。
3. 旧名单（含已关闭 skill）驱动 `AgentSkillsField` 用户组渲染；`checked = value === undefined || value.includes(name)`（`:18`）使缺席/含名都显示 ON。
4. 服务端无辜：`scan()` 读内存最新值，会话经 `markAllSessionsReloadPending` 下一条消息重建 catalog（聊天侧按既定语义生效）。
5. 连带：`useProjectSkills` 同策略，聊天 `/skill:` 补全与市场“已安装”映射同样残留（前者选中后被服务端拒绝）。

## 二、为什么“记住选择”天然成立（无需改存储）

- agent 的 `userSkills` 存于 `profile.md`，与全局开关独立。全局关 → 服务端名单剔除 → Dialog 行消失，但字段值原样保留（Dialog 只在用户显式 toggles 时才写回该字段）。
- 全局重开 → 行回来，`value` 仍是旧值 → 开关恢复上次状态。唯一前提是 Dialog 读到的是新鲜名单，即修法只做失效。

## 三、修法（只改 renderer，两步）

1. `UserSkillsPanel.save` 成功后作废全部项目 skill 缓存：`queryClient.invalidateQueries({ predicate })`，predicate 匹配 `queryKey[0] === "projects" && queryKey[2] === "skills"`（同时覆盖 `skills` 与 `skills/all` key）。全局变更影响所有项目，不能只清当前项目；key 前缀 `["projects"]` 太宽（会误伤会话等查询），用 predicate 精确到 skill 域。
2. 不碰 server、不碰 `useProjectSkills`、不给 `useAllSkills` 加 `staleTime`（失效后挂载即重取，足够；`staleTime: 0` 会让每次聚焦都重取，浪费）。

## 四、测试

- `UserSkillsPanel` 保存后断言 `skills`/`skills/all` 查询被标失效（可 spy `queryClient.invalidateQueries` 或读 cache 状态）。
- `AgentSkillsField` 在刷新后名单下：全局关（无此行）→ 全局开（行回来且开关为旧值）的 round-trip（mock 两次 `listSkills` 返回）。
- 不回归 `Composer`/`MarketplaceDialog`（同 key 族一并被失效覆盖）。
