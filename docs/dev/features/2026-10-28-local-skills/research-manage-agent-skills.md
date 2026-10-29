# manage_agent 管理 skill 白名单 — 现状与可行性调研

- 日期：2026-10-29
- 状态：已决策并进入实现。D1 接受沿用审批（skill 只注入文本，风险低于 `tools` 自加；yolo agent 绕审批与 `tools` 一致，不单独处理）；D2 拒绝未知名并附合法名单；D3 不加新语法，传完整名单即回全开（全量折叠为删字段）；D4 create 支持 `skills`。
- 约束：只读仓库代码，未读取任何用户本地 skill 目录
- 背景：`design.md` core 节明确“`manage_agent` 不管理这个字段，与 yolo、unlimited 开关一致”，被列入“本期不做”。本篇调研该决定是否要推翻、怎么加、代价多大。

## 一、现状（代码实情）

### 1. manage_agent 的字段版图

`packages/core/src/tools/manage-agent.ts`：

- params（`:10-117`）：`action`（list/get/create/update/link_card/unlink_card）、`agent_id`、`name`、`alias`、`system_prompt`、`model`、`tools`、`context`、`quick_links`、`quick_replies`、`time_perception`、`path`。无 `skills`，无 `yolo`/`unlimitedAsk`/`unlimitedToolCalls`。
- `tools` 是最接近的先例（`:53-58`）：**全量替换**语义（"Full replacement list… Omit to leave unchanged"），`validateTools`（`:212-221`）对照静态 `KnownToolsRef` 拒收未知名、去重；create（`:290-291`）缺省写 `[]`，update（`:325-326`）仅传了才替换。
- `summarize`（`:145-168`）不含 `skills`/`yolo`/`unlimited*` —— 模型经 list/get **看不到**当前白名单状态，这是加开关前必须补的洞，否则模型只能盲写。
- 写操作统一走 `isManageAgentWriteAction`（`:140-143`，create/update 需审批），skill 读写天然继承审批闸，无需新审批点。
- 接线（`capabilities/agent-mgmt/index.ts:10`）：`createManageAgentTool(host.projectStore, host.toolCatalog, host.agentId)` —— 手里有 `projectStore`，执行期可实时 `projectStore.skill.list()` 取项目 skill 名单，无需改装配签名。

### 2. 白名单的存储与解析已就绪

- `AgentProfile.skills?: string[]`（`core/src/types.ts:52`），`agent-profile.ts:133-135` 解析（字符串数组才认，否则视为未设置），`agent-markdown.ts:129-131/191-193` 读写（`undefined`=全开、`[]`=全关）。
- contracts `agentProfile.skills`（`contracts/src/agents.ts:53`）已存在。加 manage_agent 参数是纯 core 工具 schema 变更，**不碰 HTTP/WS 契约**，无持久化格式变更（可选字段缺席即旧语义），无需迁移。

### 3. 语义锚点（design.md 已定，不可另起炉灶）

缺省=全开、`[]`=全关、只管项目侧（builtin/`.agents`/`.spherse`）、agent 级与已启用用户级不受约束、三路过滤（catalog/`load_skill`/slash）已用 `isSkillAllowedForAgent` 统一。manage_agent 只需做“写白名单 + 读回显”，判定逻辑零新增。

## 二、可行性：完全可行，模式照抄 `tools` 字段

改动清单（估计 1 个文件主体 + 测试）：

1. `ManageAgentParams` 加 `skills: Type.Optional(Type.Array(Type.String()))`，描述写明：全量替换、仅项目 skill 名、空数组=全关、省略=不动、用户级 skill 名不接受。
2. `summarize` 加 `skills: profile.skills ?? null`（用 `null` vs 缺席区分“全开”与“未设置”——二者语义相同，取一即可，建议直接回显 `profile.skills`，缺席即全开）。
3. create：`if (params.skills !== undefined) frontmatter.skills = [...new Set(params.skills)]`（缺省不写字段，保持全开）。
4. update：同上；空数组写 `skills: []`（显式全关）；**不提供“删字段回全开”的表达**（见 §三决策点 D3）。
5. 校验函数 `validateSkills(names, projectStore)`：执行期 `list()` 取 `source !== "user"` 的名字集合，未知名 → `ValidationError`（与 `validateTools` 同形，fail-closed）。

测试（照 `manage-agent.test.ts` 现有模式）：list/get 回显 skills；create/update 写回 round-trip；未知 skill 名拒绝；用户级 skill 名拒绝；空数组全关；省略不动。约 6 条。

i18n：零影响（工具 schema 描述是面向模型的英文，无 UI 文案）。

## 三、待决策（动手前需用户拍板）

- **D1 自授权风险**：`update` 的 `agent_id` 缺省=调用者自己（`:310`），模型可给自己加 skill。`tools` 字段已有同样口子，且写操作需用户审批，实际风险=审批流强度。是否接受“沿用审批，不加额外限制”？
- **D2 未知名是拒绝还是存**：拒（与 `tools` 一致，拼写错误早暴露，但 skill 改名后旧白名单 update 会失败）vs 存（脏名无害——过滤按名匹配，且“恢复全开=传全名单”要求名单可见，所以 `get` 回显是前提）。建议：拒绝 + `get` 回显当前名单 + 错误信息带出已知名单（`validateTools` 已有此模式）。
- **D3 回全开的表达**：不提供删字段语法；模型要放开时传完整名单（`get` 回显 `availableSkills`），全量名单折叠为删字段。
- **D4 create 是否带 skills**：建议顺手带（同一参数，零额外成本），否则 create 的 agent 永远全开起步再 update 一次，多一次审批打扰。

## 四、结论

- 技术上无阻塞：存储、解析、契约、判定、审批全部就绪，只是把 `tools` 字段的模式复制到动态名单上。
- 唯一真问题是 D1（模型自改白名单），但本质是既有审批流是否可信，而非新攻击面（`tools` 自加、system_prompt 自改写早已存在）。
- 若确认 D1–D4，可直接写 design（半页）开工；工作量约半天（含测试）。
