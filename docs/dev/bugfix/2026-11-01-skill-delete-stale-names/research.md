# skill 删除后 agent 名单残留 — 调研（2026-11-01）

- 现象：删除某个项目 skill 后，agent 的 `skills` / `userSkills` 名单里还留着它的名字（“不同步”）。
- 结论：**语义无害的脏数据残留，不是功能 bug**；建议接受现状（方案 A）。仅当出现实际受害场景再做方案 B。

## 一、代码现状

- 白名单按名匹配：`isSkillAllowedForAgent`（`packages/core/src/store/skill.ts:41-48`）、`isUserSkillAllowedForAgent`（`:50-57`）对名单外的名字一律返回 false。被删的 skill 名必然 miss，**等价于关闭**。
- `SkillStore.get()` 对不存在的目录返回 null（`parseSkillInDir` 读不到 `SKILL.md`），catalog / `load_skill` / `/skill:` 三路自动消失，无需任何清理。
- Dialog 写回时剪枝：`AgentSkillsField` 的 toggle 以当前可见名单为基准（`AgentSkillsField.tsx:25,30`；用户组 `preserveHidden` 只保留“全局暂时关闭”的名字，已删除的名字若全局源还在、目录已无，则不会出现在列表里，下次编辑即被洗掉）。
- `manage_agent` 写回同样拒绝未知名字（`resolveSkillAllowlist` 抛 `ValidationError`），脏名无法经工具链重新写入。
- 唯一残留：`profile.md` 里留着已删除的名字；**复活条件**——同名 skill 被重建（项目目录或全局目录）且（用户侧）全局重新开启时，旧名单自动重新生效。
- 另：server 侧**没有 skill 删除接口**（`server/src/routes/skills.ts` 只有 list/get/create/install），删除即文件删除（Skill 面板经文件树删除），因此不存在“删除成功回调”这样的中心钩子可挂清理逻辑。

## 二、可行性

- 方案 A（推荐）：接受现状，零成本。语义安全（fail-closed），残留只在“同名重建”这种小概率路径下复活，且复活本身语义可解释（名字即身份）。
- 方案 B：主动 prune——在 skill 目录删除/安装覆盖时扫描全 agent 名单并改写 profile。无中心钩子，需新建：文件 watcher 监听 `.spherse/skills` + 各用户 skill 源，或新增 `DELETE /skills/:name` 路由并在此处收敛；还要处理 agent 会话 reload 标记与并发写。约 1 天，且把“删文件”这种轻操作变成重操作，不值。

## 三、影响面

- 方案 A：无。
- 方案 B：core（`SkillStore`/`ProjectStore` 删除入口＋全 agent 改写）、server（若走路由）、`markAllSessionsReloadPending` 级联、回归测试（删除→名单清理→重建同名→行为）。
