# agent 所属快捷回复

- 日期：2026-10-12
- 状态：已实现，待验收（见 design.md；2026-10-18 已决策，限值已落定 10 条 / 16 字符）
- 版本：v1.0.1
- 来源：排期总览（用户直接提出，无调研文档）

## 范围

快捷回复归属到 agent（每个 agent 有自己的快捷回复集，而非全局共用）。

## 关联

- 数据归属、UI 入口、「全局快捷回复」命名澄清见 [design.md](./design.md)；结论：新建 per-agent 能力，不做全局迁移
- 2026-10-18 已决策：schema `{label, description, text, action}`（当前仅 fill 填入）、CRUD 在 agent 编辑页（有管理权限可改）、Composer 上方 button 行
