# 对话 token 数据 + 输入框预计 token 展示

- 日期：2026-10-12
- 状态：已实现，待验收（见 design.md）
- 版本：v1.0.1
- 来源：`docs/dev/investigation/2026-10-06-cross-project/09-token-usage-feasibility.md`（结论可行，建议先做 A1 + B1）

## 范围

对话 token 数据展示 + 输入框预计 token 展示；真实 provider `usage` 已采集落库、`sessionStatus` 接口已存在，主要是前端展示工作。

## 关联

- 分项定义（A1/A2/B1/B2/A3）与优先级见来源文档
- 方案见 [design.md](./design.md)（2026-10-18 代码核查：数据层全通，缺 hook/刷新/UI/导出）
