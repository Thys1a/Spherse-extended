# 实施计划（对照 `design.md` §三～§四、§六）

顺序 P1 → P2 → P3 → T1 → T2 → P4，各自一个 commit；做完跑 `npm run verify`。

- [ ] **P1 整卡直读修复**（§3.1）：改三处 description（`read-file.ts` 条件式重定向、`READ_CARD_GUIDE` 工作流、`search-content.ts` 注明片段）→ verify：`npm test --workspace=packages/core`
- [ ] **P2 data.query 打通**（§3.2）：contracts schema → server 路由 → app `dataQuery` → SDK `data.query`（返回整包）＋白名单 → verify：contracts 正/负、server 往返（含非法 `after` 空页）、handler 透传
- [ ] **P3 摘要补字段**（§3.3）：`types.ts`＋`toSummary`＋`search.ts`＋contracts 两处 schema → verify：字段断言（`toEqual` 碎裂属预期，同步改）
- [ ] **T1 extensions 写开放**（§3.4）：contracts `entryPatch`＋`validatePatch`＋浅合并（脏值以 `{}` 为底，`changed` 比合并结果）＋`canonicalEntry`＋GUIDE/errorText＋类型收窄 → verify：反转既有断言四处（t3 两处＋contracts 两处）＋新增合并/删键/脏值/undo 用例
- [ ] **T2 case_sensitive**（§3.5）：顶层可写字段＋`extensions.caseSensitive` 回退＋`matchKeys`＋`normalizeEntry` → verify：true/false/回退三种用例
- [ ] **P4 skill 文档**（§3.6）：`spherse-use-ui-sdk` 注明 `data.entries` 全量下载 → verify：presets build 通过
- [ ] **文档同步**（§四，随对应 commit 做）：`server.md` 路由表＋端点数、`server/README` 个数、`ui-sdk.md` 列表＋白名单、`data-conventions.md:264`
- [ ] **验收**（§六）：人工 tool-trace 场景＋`npm run verify`＋约束三条（无新 `FileWriteMutex`、不动 `.spherse`、不动 manifest 语义）
