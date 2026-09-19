# MVU_Zod_StatusMenuBuilder 调研

调研时间：2026-09-17
仓库：https://github.com/KritBlade/MVU_Zod_StatusMenuBuilder（17 stars / 3 forks，39 commits）
许可：**AGPL-3.0，只能学思路，不能搬代码**

## 定位

SillyTavern 内多角色数值追踪的前端 GUI 搭建器：浏览器里点选拖拽排状态菜单布局，数据存本地、随聊天持久化。配套演示视频与 `Images/builder.jpg` 见仓库。

## 产出物（三件套）

- **示例数据配置**：按自己设计搭一套样例数据。
- **Schema 输出**：定义数据结构，告诉 AI 按什么格式存变量（即 Zod schema）。
- **JSONPatch 工具**：自动生成变量更新的补丁规则。

## 可编程点

- **模板系统**：换整套颜色字体；列表类展示（背包、装备）可自定义模板。
- **Logic Tab**：装备穿脱动态加减属性并重算总值。
- **字段级 JS**：单个字段可注入逻辑。官方两例：`Mainchar.level > 70 则名字变红`（动态样式）；`按等级读不同 lorebook 条目的图片 URL 展示`（读任意 lorebook 条目内容）。
- 读取约定：非集合变量默认从 `root` 按全路径读，`_output = getV(root, 'World.Date', 'Default')`（空值回退 Default）。

## 运行依赖

Builder 本体无需扩展即可运行；但做出来的状态菜单要在 ST 里工作，需装 Tavern Helper + ST-Prompt-Template（靠二者才有 JS 执行与变量读写）。

## 可借鉴点（窄闭环）

核心是一条与题材无关的最小闭环：**schema 约束 AI 输出 → JSONPatch 式增量更新 → Zod 校验拒绝脏写 → 变量持久化 → GUI 重渲染**。Spherse 上对应组装件是 `data.mutate（$manifest schema）+ HtmlCard`。Builder 的“拖拽出 schema + 补丁规则”则是 Agent 主题 skill 之外的第二种无代码定制形态。
