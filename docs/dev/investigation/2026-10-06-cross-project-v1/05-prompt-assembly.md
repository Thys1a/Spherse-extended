# 一条 Prompt 的拼接内容与顺序（Spherse）

调研时间：2026-10-10
对象：Spherse 自身运行时（`packages/core`），非外部项目对照。
范围：只回答「一次装配如何拼 system prompt、每轮发给 LLM 的是什么、顺序是什么」；不改 backlog，不产出 design。

## 一、结论

- system prompt 由 `buildPromptAndTools` 按**固定段顺序**压块，空块整块丢掉后用 `\n\n` 连接。
- tools 按 `profile.tools` 声明顺序过滤；MCP 工具在首个 `beforeTurn`（配置版本变化时）**追加**。
- 每轮真正发给 LLM 的是 `systemPrompt + tools + convertToLlm(messages)`；worldbook、tool 输出预算、附件剥离都只改 **wire 视图、不落库**。

## 二、装配流程

```text
[profile.md + AGENTS index + profile.context 声明的文件]
        |
        v
buildPromptAndTools()                                    agent-assembly.ts:137-201
  1  <project-instructions>   AGENTS index（空 -> 整块丢掉）
  2  <agent-profile>          profile.systemPrompt（空 -> 整块丢掉）
  3  <session-context>        agent-name / [agent-alias] / agent-slug / session-id
  4  [time-perception]        裸文本、无 XML 标签；仅当 profile 开启时间感知
                             "time-perception: enabled" + "不许输出 <time> 标签"
  5  <preloaded-context>      profile.context 文件逐个读入，读不到/无读权限跳过；
                             每个文件包成 <context-file path="...">
  6  <skill-catalog>          全局 skill 先列，agent 级同名覆盖（保持首次出现位置）；
                             只有 <skill-item name description/>，无正文
  7  <memory>                 该 agent JSONL 最后 20 条，每行 "- content"（tags 不展示）
        |
serializeBlocks(): 过滤 null/空文本 -> join("\n\n")      kernel/context-block.ts:6-13
        |
        v
Agent.initialState = { systemPrompt, tools }             agent-assembly.ts:238-244
        |
beforeTurn（每个 MCP 配置版本只跑一次）                  capabilities/mcp/index.ts:66-91
  agent.state.tools += [...mcpTools]                     （重名去重、追加在末尾）
  agent.state.systemPrompt += "\n\n" + <mcp-context>
```

## 三、段表（顺序即优先级顺序）

| # | 段 | 来源 | 出现条件 |
|---|---|---|---|
| 1 | `<project-instructions>` | AGENTS.md index（`readIndex()`） | 非空才有 |
| 2 | `<agent-profile>` | `profile.systemPrompt` | 非空才有 |
| 3 | `<session-context>` | name/alias/slug/sessionId | 恒有 |
| 4 | `time-perception`（裸文本） | profile `timePerception` 开关 | 仅开启时 |
| 5 | `<preloaded-context>` | profile `context` 路径 | 至少一个文件读成功 |
| 6 | `<skill-catalog>` | 全局 + agent 级 skill | 至少一个 skill |
| 7 | `<memory>` | per-agent `memory.jsonl` 末 20 条 | 非空才有 |
| 8 | `<mcp-context>` | MCP server 说明/资源目录 | 首个 beforeTurn 按需追加，非装配块 |

说明：只有 skill、time-perception、memory 三家贡献 `contextBlocks`，所以 capability 注册序（`factory.ts:47-58`）实际只决定 6/7 相对位置。

## 四、每轮发送流程

```text
sendMessage()                                            agent-runner.ts:189-280
 ├─ pendingReload? -> applyReload()                      重建 systemPrompt + tools + streamFn
 ├─ expandSlashMessage()                                 /skill: /command: 改写用户文本；未知名挡掉
 ├─ ensureModel() + ensureWritable()
 ├─ turnHooks.beforeTurn(agent)                           MCP 合并（tools 追加 + <mcp-context>，同版本一次）
 ├─ attachments 组装 + sanitize 剥离
 ├─ maybePreCompact()                                    0.75 x window 先压再发
 ├─ eventLog.append(user/message + turn/start)
 ├─ syncBufferFromLog() -> agent.state.messages
 └─ agent.prompt(userMessage)
      └─ convertToLlm(messages)                          agent-assembly.ts:247-255
           ├─ worldbookProjector                         扫描最近 10 条/4000 字符（先剥旧块），
           │                                            按 insertion_order 取 <=8 条/2000 tokens，
           │                                            在消息末尾追加 <worldbook> user 消息（wire only）
           ├─ toolOutputBudget                           单条 toolResult 截 32KB、近 5 轮外收缩（wire only）
           ├─ attachments                                剥 _attachments 引用（wire only）
           └─ 只保留 user / assistant / toolResult
LLM 最终看到： [systemPrompt] + [tools] + [投影后的 messages]
历史里另有： <compaction-digest>（user 消息）、<skill-content>（toolResult）
```

## 五、两个易错点

- MCP 块不在热重载后的 systemPrompt 里立刻出现：`applyReload` 重建会丢掉它，等下一轮 `beforeTurn`（版本变化）再追加；同一版本内不重复拼。
- `<time>` 是**流式装饰器写在 assistant 正文前缀**的，不是 prompt 注入；空块整块消失，所以无 AGENTS.md / 无 skill / 关时间感知的 prompt 会比骨架短，但顺序不变。

## 六、范围与不做

- 不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改任何 `docs/official/` 文档。
