---
name: spherse-create-command
description: 当用户想要创建或修改全局快速命令（command）时使用，涵盖 command 与 skill 的区别、存储位置、frontmatter 格式、参数与文件引用、调用与管理方式
---

# 创建全局快速命令（Command）

Command 是一段可通过 `/command:{name}` 在聊天输入框直接调用的提示词模板。调用时模板先展开（填参数、内联文件），再作为用户消息发给当前 agent。

## Command 与 Skill 的区别：我要做 X，用什么

| 我要 | 用什么 |
|------|--------|
| 把常用提示词变成 `/` 一键调用 | **command**（本篇） |
| 封装复用的写作规范、领域知识、工作流程 | skill（见 `spherse-create-skill`），agent 用 `load_skill` 按需加载 |
| 全项目通查某个机制怎么实现 | `search_content`（最后手段：必须带 `path` / `includePatterns` 收窄，禁止裸搜短词） |
| 只查世界书条目 | `search_card` / `read_card`，不要用 `search_content` 扫卡文件 |
| 打开已知路径的文件 | `read_file` |

## 存储位置

```
.spherse/commands/{name}.md
```

每个 command 即一个 `.md` 文件，文件名（去掉 `.md`）就是调用名。Command Panel 读写的是同一批文件；列表每次现读目录，新文件即时生效，无需重启 session。

## 文件格式

文件 = YAML frontmatter + Markdown 模板正文，用 `gray-matter` 解析：

```markdown
---
description: 一句话说明这个命令做什么
model: provider/model-id
---

把以下内容整理成一份更新日志，只收录 {{date}} 之后的变化：

$ARGUMENTS
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `description` | 否 | 一句话用途，显示在 `/` 联想菜单与 Command Panel 列表里；写清楚 agent 才能在候选中认出它 |
| `model` | 否 | 指定该命令调用时切换的模型（`provider/model-id` 格式）；不填则用当前会话模型 |
| 模板正文 | **是** | 发送前做两次展开（见下）。正文为空的文件会被忽略 |

### 命名规则

- 非空，不含 `/`、`\`、`:`，不以 `.` 开头
- 同名创建会报冲突（`Command "..." already exists`），改名 = 新建 + 删除旧文件

## 参数：`$1` 与 `$ARGUMENTS`

调用 `/command:review pr-123 --short` 时，空格切分后的参数按 `$1`、`$2`……依次填入模板：

```markdown
---
description: Review 指定 PR 并给出简短结论
---

Review PR $1，输出不超过 200 字。附加要求：$2
```

- `$1` 取第一个参数；缺参数时调用直接报错（`requires argument $1 but none was provided`），不会发一半的消息出去
- `$ARGUMENTS` 取整段原文（含空格），适合自由文本
- 没出现在模板里的参数会被**忽略**（不会追加到消息末尾），所以占位符与参数个数要对齐

## 文件引用：`@路径`

模板里的 `@相对路径` 会在发送前被替换成文件全文（超长按预算截断并标注）：

```markdown
---
description: 按仓库规范检查这份设计文档
---

按 .spherse/skills/review/checklist.md 的标准检查 @docs/dev/bugfix/2026-09-22-search-content-oversized-result/design.md
```

- 路径必须在项目内且可读，否则调用报错（越界 / 不可读 / 不存在各有明确错误）
- 大字段整段塞进上下文会挤爆窗口（见 `search_content` 撑爆事故）：引用只点名必要文件，不要 `@` 整个目录或巨型 JSON

## 调用与管理

- **调用**：聊天输入框输入 `/command:{name} 参数…`，有 `/` 联想补全（输入 `command:` 即过滤出命令列表）
- **管理**：Command Panel 可增删改查（对应 `GET/POST/PATCH/DELETE /api/projects/:projectId/commands[/:name]`）；改模板正文为空会报 `command template is required`
- **调用不存在的命令**：报 `Command "..." not found`，检查拼写或去 Command Panel 确认列表

## 创建方式

首选 Command Panel（自动处理命名校验与 frontmatter 格式）。直接写文件亦可：

```text
路径：.spherse/commands/{name}.md
```

按上面的格式写完整 frontmatter + 模板正文即可；`write_file` 会自动创建不存在的父目录。

## 注意事项

- 一个 command 只做一件事；通用规范沉淀请做成 skill，不要全塞进模板
- `description` 是 agent 与用户在候选中识别它的唯一依据，写具体动词 + 对象，不要写"常用命令"这类空话
- 需要固定切模型的场景（如长文总结切大窗口模型）才填 `model`；普通命令留空，跟随会话模型
- 不要用 `search_content` 裸搜短词来"发现"命令机制——命令列表直接看 `.spherse/commands/` 目录或 Command Panel
