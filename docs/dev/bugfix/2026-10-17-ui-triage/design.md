# UI 三问题定位（合并）：slash 菜单截断 / 任务栏 Electron 图标 / 搜索无显式入口

- 日期：2026-10-17（方案 2026-10-18 评审修订，同日实现）
- 状态：已实现（分支 `bugfix/2026-10-17-ui-triage`），待用户验收
- 验证：lint 0 errors；全仓库 typecheck 通过；单测 i18n 10/10、desktop 257/257、app 1697/1697；`check:i18n` 通过
- 来源：安装包（`release/Spherse-Setup-*.exe` 安装后）真机反馈 + 代码只读核查（未执行构建/安装）

## 决策记录（2026-10-18，用户拍板）

1. slash：全量渲染 + 滚动定位。
2. AUMID：仅 packaged 才 `setAppUserModelId`。
3. 同批：window.ts 图标路径、浮动/停靠聊天入口、移动端入口。
4. i18n：新增 `chat.find.*`。

## 一、`/command:` 列表显示不全

### 现象

输入 `/command:` 只看到前几个命令，命令总数多于 8 个时剩余命令不可达。

### 根因

硬截断在 `packages/app/src/features/chat/lib/slash-menu.ts:65`：

```ts
return items.slice(0, 8);
```

链路核查：数据源全量（`app/src/queries/commands.ts` → `server/src/routes/commands.ts:23-27` → `core/src/store/command.ts:33-45` `readdir+parse+sort`），截断只发生在前端 `filterSlashItems():41-66`，`skill/command/agent` 三类共用。输入 `/command:` 时 `query=""`，`includes("")` 全命中然后只留前 8。

次要因素：

- `packages/app/src/features/chat/Composer.tsx:330` 菜单容器 `max-h-56 overflow-y-auto`，超出需滚动且无“共 N 个/已截断 N 个”提示，易误读为数据不全。
- `slash-menu.ts:21` `TOKEN_RE` 要求打完完整前缀 `/command:` 才触发，打 `/command` 或裸 `/` 无列表（语义不变，见下）。

### 修复方向（已决策：全量渲染 + 滚动定位）

- `slash-menu.ts:65` 去掉 `slice(0, 8)`，直接返回全量。
- `Composer.tsx:330` 菜单容器加 `overscroll-contain`（滚到底不带动外层聊天）；`Composer.tsx:376-386` 选中项变化时对 `[role=option]` 对应项 `scrollIntoView({ block: "nearest" })`（先例 `GlobalSearchDialog.tsx:84-88`，容器加 ref），否则 ↑/↓ 会选中视口外的条目。
- `TOKEN_RE` 冒号前缀语义不改（`slash-menu.test.ts:11-13` 已钉死 `matchSlashToken("/skill")` 为 null），避免拦截正文里的 `/`。
- 测试：`slash-menu.test.ts` 补 >8 条全量断言、修正 `limits agent matches`（`:45-51`）名不实；`ComposerSlash.test.tsx` 补多命令 + ↑/↓ 选中滚动（jsdom mock `scrollIntoView`）。

## 二、安装版任务栏显示 Electron 图标 / 固定后打开 Electron

### 现象

`Spherse-Setup-*.exe` 安装后的正式版仍复现。开始菜单/桌面快捷方式图标正常，任务栏固定项的 target 是 `D:\work\Spherse\node_modules\electron\dist\electron.exe`。

### 已排除（配置层对齐）

- `packages/desktop/electron-builder.yml`：`appId: com.spherse.app`、`productName/executableName: Spherse`、`win.icon: build/spherse-icon.ico` 全有；`win.target` 无 arch 污染（arch 由 `build-and-release.yml` matrix `--win --x64/--arm64` 控制）。
- 图标源文件合法：`packages/desktop/build/spherse-icon.ico`（107414 字节）含 6 个尺寸——16/32/48/64/128/256，Windows 任务栏所需尺寸齐全；CI 在 `packages/desktop` 下构建，`build/` 相对路径解析正确，rcedit 嵌入失败会在构建期 loud fail。
- 图标文件存在：`build/` 下 `.ico/.icns/.png/.svg` 四件套齐。

### 已证实（exe 本体无问题，2026-10-17 只读核查）

- 本机已安装 `Spherse 1.0.0-alpha`（HKCU uninstall 项），开始菜单 `Spherse.lnk` 目标正确：`D:\note\Spherse\Spherse.exe`（自定义安装目录，文件存在，`FileDescription: Spherse`）；桌面 `Spherse.lnk` 目标同样正确。
- **决定性比对**（`System.Drawing.Icon.ExtractAssociatedIcon`，只读，不执行）：已安装 exe 的关联图标 hash == 仓库 `spherse-icon.ico` 32px 渲染 hash（`5987E9…` 一致），且 ≠ stock `node_modules/electron/dist/electron.exe` 图标（`74D479…`）。即 rcedit 已正确嵌入自定义图标。

### 根因（2026-10-18 修订）：dev 与安装版共用同一 AppUserModelId，且钉住的是 dev 窗口本身

`packages/desktop/electron/main.ts:22-24` 在 win32 下**无条件**执行：

```ts
app.setAppUserModelId("com.spherse.app");
```

dev 模式（`npm run dev` → `electron-vite dev` → `node_modules/electron/dist/electron.exe`）跑的是同一个 `main.ts`，于是 dev 与安装版向 Windows 注册了**同一个** `AppUserModelId`。决定性证据是任务栏固定项的 target 就是 `electron.exe`——即钉住的是 dev 窗口本身，此后点击该固定项直接起一个无参数裸 Electron 窗口（无 dev server、无应用）。同 ID 还导致两者任务栏混组。图标缓存重建无效，因为跑的二进制本来就是 `electron.exe`，不是缓存问题。

### 修复方向（已决策：仅 packaged 才 setAppUserModelId）

- 新增 `packages/desktop/electron/app-id.ts`：`resolveAppUserModelId({ isPackaged, platform }): string | null`（packaged+win32 → `com.spherse.app`，否则 `null`），配 `app-id.test.ts`（照 `fix-path.ts` 模式；`main.ts` 是入口、顶层即执行副作用，无法直接单测）。
- `main.ts:22-24` 改为取 helper 结果，非 null 才 `setAppUserModelId`。dev 用 Electron 默认 AUMID，天然与安装版不同组。
- 取舍（接受）：dev 的 Windows toast（`ipc/notifications.ts:20` 依赖 AUMID 匹配快捷方式）在未安装环境可能不弹。
- 验收含手动步骤：取消已钉死的 `electron.exe` 固定项（代码修不好存量钉）；dev 与安装版任务栏不再同组。

### 附带发现（同批修）

`packages/desktop/electron/window.ts:15` 运行时读 `../../build/spherse-icon.png`，但 `electron-builder.yml` 的 `files` 仅含 `dist/**/* + package.json`，打包后 `resources/app/build/` 不存在，`BrowserWindow icon` 加载失败。修法：`files` 追加 `build/spherse-icon.png`；验证 `npm run pack -w @spherse/desktop` 后 `release/win-unpacked/resources/app/build/spherse-icon.png` 存在。

## 三、聊天搜索缺少显式 UI 供用户发现

### 现状（功能已完成，入口不可发现）

两套搜索均有实现、无 backlog（`docs/official/project-structure.md:314` 已登记为既有能力）：

- 会话内查找：`features/chat/index.tsx:112,115-126,255-261` `findOpen` + `Ctrl/Cmd+F`（仅焦点在聊天内才拦截）+ `components/find-bar/FindBar.tsx`。
- 跨会话全局搜索：`features/global-search/GlobalSearchDialog.tsx` + `layouts/ProjectScope.tsx:53-70` `Ctrl/Cmd+P`，API/检索/跳转全链路齐。

入口盘点（全部隐式）：

- 会话内查找：**零可见按钮**。唯一入口是 `Ctrl+F`；`features/chat/Header.tsx` 只有 agent 名/quickLinks/compact/close，无搜索按钮。`hideHeader` 的浮动/停靠聊天（`FloatingChatContainer.tsx:117`、`DockedChatManager.tsx:103`）连 Header 都没有。
- 全局搜索：唯一入口是 `Ctrl+P` 和项目面板右键菜单（`features/project-panel/index.tsx:54-62` `ContextMenuItem`），无工具栏按钮；移动端无键盘，等于无入口。

结论：用户不读文档/源码则无法发现搜索功能，与“功能是否完成”是两回事——功能完成，可发现性缺失。

### 修复方向（已决策）

- i18n：`packages/i18n/src/locales/{zh-CN,en,zh-TW}.ts` 新增 `chat.find.*`（open/placeholder/noMatch/previous/next/close）；`FindBar.tsx` 加可选 `labelPrefix`（默认 `content-browser.find`），chat 传 `chat.find`。
- `Header.tsx` 加可选 `onFind` + 搜索按钮（`SearchIcon`，`ml-auto` 顺位，tooltip 带快捷键）；`chat/index.tsx:234-243` 传入，覆盖主聊天 + 标签聊天 + 移动端。
- 浮动/停靠（`hideHeader`）：`Chat` 内渲染角落小搜索按钮切换 `findOpen`，不动 `FloatingFrame`（停靠窗口无标题栏，插槽方案覆盖不到）。
- 全局搜索可见入口：`project-panel/index.tsx` 顶部（`AgentSessionList` 上方）加按钮，桌面 + 移动端抽屉（`SidePanel` 内复用同一 `ProjectPanel`）共用。
- 测试：`Header.test.tsx`（按钮触发 onFind）、`ChatFind.test.tsx`（按钮开 FindBar）、ProjectPanel 按钮开 dialog 用例。

## 四、CI verify 失败：desktop typecheck TS2352（2026-10-18，与本次 triage 无关，push dev 后暴露）

### 现象

push dev（`6710a81`，纯文档提交）触发的 verify 在 `@spherse/desktop` 的 `tsc --noEmit` 挂掉，唯一 error：

```text
electron/migrate-legacy-settings.test.ts(157,13): error TS2352: Conversion of type
'DesktopPrefs & GeneralPrefs' to type 'Record<string, unknown>' may be a mistake
```

失败行：

```ts
expect((getHostPrefs() as Record<string, unknown>).futureField).toBeUndefined();
```

附带的 18 条 `react-refresh/only-export-components` / `exhaustive-deps` 只是 warning（lint exit 0），与本次失败无关，不处理。

### 根因

`getHostPrefs()` 返回 `DesktopPrefs & GeneralPrefs`（`settings.ts:60`），而这两个类型在 `@spherse/app/host-bridge`（`host-bridge.ts:57-68`）中声明为 **`interface` 且无索引签名**。`interface` 不像 `type` 别名那样拥有隐式索引签名，因此该交叉类型与 `Record<string, unknown>` 既不可互相赋值、TS 直接按 TS2352 拒绝断言。运行时无影响（vitest 剥类型照跑），纯编译期问题。

引入链（`git log -S` 实证，均已在 dev 祖先内）：

- `db6ce56`（merge144 P3 bridge migration）引入了 `DesktopPrefs & GeneralPrefs` 返回类型（两 `interface` 自带，无索引签名）。
- `c9a3866`（P3 review fix）在该测试文件新增 `"drops unknown legacy top-level fields…"` 用例时写下了这次直接断言，埋下 TS2352。

### 为什么没早发现

- pre-commit 钩子只跑 `npm run lint`（ESLint，无此类型规则），本次文档提交 lint 0 errors 通过。
- `npm run typecheck` 依赖各包 `dist` 类型产物、平时只在 CI verify 跑；`npm test`（vitest）不做类型检查所以一直是绿的。renderer 侧同理——类型错误只能靠 typecheck 发现（AGENTS.md 已注明）。

### 修复方向（已实施，2026-10-18）

与同文件第 81 行惯例对齐，加一级 `unknown` 中转：

```ts
expect((getHostPrefs() as unknown as Record<string, unknown>).futureField).toBeUndefined();
```

备选（更干净、零断言）：`expect("futureField" in getHostPrefs()).toBe(false)`。不考虑给 prefs 加索引签名——会放宽生产类型，与迁移代码依赖已知键的前提相悖。修后本地用 `npm run typecheck --workspace=packages/desktop`（需先 `npm run build` 出 dist）验证，另本案说明 c9a3866 这类“只改测试”的提交同样需要跑全量 typecheck。
