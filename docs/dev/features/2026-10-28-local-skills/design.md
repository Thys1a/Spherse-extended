下面是按调研结论整理的方案。动手前有三处需要你确认，问题放在方案后面。

## 语义

- **优先级**：agent 级 > `.spherse/skills` > `.agents/skills` > 用户级 > builtin。同名时取优先级最高的那一个，因此项目 skill 始终覆盖同名的用户 skill。
- **用户级 skill**：默认全部关闭，开关全局生效（本机维度）。开关以 skill 目录的绝对路径为键，而不是 skill 名，因为不同来源可能有同名 skill。
- **Agent 白名单 `skills?: string[]`**：
  - 只管项目侧 skill（builtin、`.agents/skills`、`.spherse/skills`）。
  - agent 级 skill 和已启用的用户级 skill 不受这个字段约束。
  - 字段缺省表示全开，所以之后新增的项目 skill 会自动加入；`[]` 表示全关。
  - 这一点与 research 里写的“空 = 全开”冲突，需要你确认（问题 2）。
- **过滤范围**：同一个判断函数同时作用于 catalog 注入、`load_skill` 和 `/skill:` 快捷命令。否则模型只要知道名字，就能加载未授权的 skill。

## 发现来源

- **内置候选目录**（按此顺序，目录不存在时标为“未找到”）：
  - `~/.agents/skills`
  - `~/.claude/skills`
  - `~/.config/opencode/skills`
  - codex 目录（路径待确认，见问题 3）
- **自定义目录**：用户在设置里添加或删除，排在内置候选之前。
- **扫描方式**：
  - 只读解析 `<dir>/<name>/SKILL.md`，复用 `SkillStore.parseSkill` 的校验（name、description 必填，目录名与 name 一致，用 `isPathInside` 检查）。
  - 不写回任何文件，不跟随越出根目录的符号链接。
  - 按需扫描，不做缓存。
- **测试约束**：home 目录以参数注入，任何测试都不读取真实的 `~`。

## core

- `SkillDefinition.source` 增加 `"user"`。
- `SkillStore` 新增可选的 `userSkills: () => Promise<SkillDefinition[]>` 提供者。它返回的列表已经按启用状态过滤、按优先级去重。`list()` 把它排在 builtin 之后、`.agents/skills` 之前；`get()` 按相同顺序查找。
- `ProjectStore` 在 open/create 时接收这个提供者，由 `assembleProject` 的选项透传进来。
- 新增 `isSkillAllowed(profile, skill)`：
  - agent 级和 `source === "user"` 一律放行。
  - 其余 skill 在 `profile.skills === undefined` 或名字在列表中时放行。
- `skillCapability`（contextBlocks 和 `load_skill`）与 `slash.ts` 都调用这个函数；不允许的 skill 报告为 not found。
- `AgentProfile.skills?: string[]`：frontmatter 是字符串数组时读取，否则视为未设置。`manage_agent` 不管理这个字段，与 yolo、unlimited 开关一致。

## 外部 companion 文件（安全敏感）

- `load_skill` 和 `/skill:` 列出用户 skill 的附加文件时用绝对路径；项目 skill 仍用项目相对路径。
- `read_file` 新增一个只读的外部根目录白名单，来源是已启用用户 skill 各自的目录（不是整个来源目录）：
  - 输入为绝对路径时，先对根目录和目标做 `realpath`，再用 `isPathInside` 判断。
  - 不在白名单内的绝对路径一律拒绝，项目内路径的逻辑不变。
- `write_file`、`edit_file`、`list_files`、`search_content` 不开放外部路径。
- 白名单在每次工具调用时实时读取，关闭某个 skill 后立即失去读取权限。

## server / contracts

- **存储**：位置待定（问题 1）。数据形状为 `{ customDirs: string[]; enabled: string[] }`，`enabled` 存 skill 目录的绝对路径。
- **新增全局路由**（不挂在项目下）：
  - `GET /api/settings/skills`：返回各来源 `{ dir, kind: "default" | "custom", exists, skills: [{ name, description, dir, enabled }] }`。
  - `PUT /api/settings/skills`：全量写入 `{ customDirs, enabled }`。
- **contracts**：
  - `skillDefinition` 和列表 schema 的 `source` 增加 `"user"`。
  - `agentProfile` 增加 `skills: Optional(Array(String))`。
  - 新增上面两个设置路由的 schema。
- **桌面端**：新增 `select-directory` IPC 和对应的 bridge 方法，用于选择自定义目录（与现有的 `select-skill-zip` 同一模式）。

## app

- **设置页新增“技能”tab，仅桌面端显示**：
  - 按来源分组列出 skill，每条有开关，默认关闭。
  - 不存在的目录置灰显示“未找到”。
  - 自定义目录可添加或删除。
  - 底部提示“新会话生效”。
- **Agent Dialog 新增“项目技能”勾选列表，默认全选**：
  - 数据来自现有的项目 skill 列表接口，去掉 `source === "user"` 的项。
  - 全选时不写这个字段；部分勾选时写名字数组；全不选时写 `[]`。
- `agent-markdown`：解析和写回 `skills`，规则同上。
- 文案按 i18n skill 同步三种语言。

## 生效时机与不做的事

- 开关和白名单在新会话或下一次 `applyReload` 时生效，与现有 catalog 的语义一致。
- `read_file` 的外部根目录白名单例外，实时生效。
- 本期不做：用户 skill 导入为项目副本、web 壳展示、mtime 缓存、`manage_agent` 管理白名单。

## 测试

- **core**：
  - 合并顺序与同名覆盖。
  - `isSkillAllowed` 对字段缺省、`[]` 和部分列表三种情况的结果。
  - `load_skill` 和 `/skill:` 拒绝未授权 skill。
  - `read_file` 外部路径：根目录内允许；越界、符号链接逃逸、已关闭的 skill、写操作均拒绝。
- **server**：在临时目录下用注入的 home 做扫描和设置读写的往返测试。
- **contracts**：新增字段与新增 `source` 值。
- **app**：设置 tab 的开关与目录增删；Agent Dialog 三种勾选状态写回的结果。


三项都已确定，方案按以下改动收口，其余部分照上一版不变：

- **开关存储**：放在 server 侧的 `userData/skill-settings.json`，内容为 `{ customDirs, enabled }`。读写方式与 `web-search-settings.json` 相同：server 自己持有、经 REST 读写，不需要 desktop 往 server 推送状态，也不放进 electron-store 的 `settings.json`。web 壳仍然隐藏“技能”tab。
- **白名单语义**：`skills` 字段缺省表示全开，之后新增的项目 skill 自动加入；`[]` 表示一个都不用；部分勾选时写名字数组。Agent Dialog 的写回规则是：全选时不写这个字段，全不选时写 `[]`，部分勾选写数组。
- **codex 目录**：内置候选目录最终顺序为：
  1. 自定义目录
  2. `~/.agents/skills`
  3. `~/.claude/skills`
  4. `~/.config/opencode/skills`
  5. `~/.codex/skills`（固定路径，不读 `CODEX_HOME`）
