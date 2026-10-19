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

`packages/desktop/electron/window.ts:15` 运行时读 `../../build/spherse-icon.png`，但 `electron-builder.yml` 的 `files` 仅含 `dist/**/* + package.json`，打包后 `resources/app/build/` 不存在，`BrowserWindow icon` 加载失败。修法演进：先是 `files` 追加 png（`pack` 实测进过 `app.asar`，当时按此销号 U1）→ 后发现 asar 虚拟路径不可靠，改走 `extraResources` 落盘（见下条追记），`files` 条目已同步移除。

### 追记（2026-10-19）：1.0.1 安装版仍复现，真因是 rollup chunks 下 `__dirname` 漂移

现象：CI 打包的 1.0.1 安装版（`1.0.1-beta`，已验证 asar 内含 AUMID 修复）任务栏仍显示 Electron 图标；exe 内嵌图标、快捷方式、无陈旧固定项均已排除，运行时 6 个进程全为 `D:\note\Spherse\Spherse.exe`。

根因：electron-vite 把 main 打包进 `dist/main/chunks/main-*.js`（安装包内实证：`__dirname$2` + 同文件 preload 路径），运行时 `__dirname` = `…/app.asar/dist/main/chunks`，于是 `window.ts:15` 的 `../../build/spherse-icon.png` 解析到 `…/app.asar/dist/build/spherse-icon.png`——不存在（真文件在 `…/app.asar/build/`）。源码态成立（`electron/` → `../../build`），dev 态成立，打包态恒失败。electron/ 下共 3 处 `../..`：preload（`dist/preload`，误打误撞正确）、renderer（`dist/renderer`，正确），只有图标这一处是错的。窗口图标加载失败 → 任务栏回退 → Electron logo。

修法（2026-10-19 已实施，决策 B，review 后改走 extraResources）：win32 直接省略 `icon`（用 exe 内嵌多尺寸 ICO）；其他平台经新纯函数 `resolveWindowIconPath`（`electron/window-icon.ts`，配单测）取图标——`files` 的 asar 内路径不可靠（asar 虚拟路径 + chunks 漂移双重风险），改走 `extraResources` 落盘真文件（`resources/spherse-icon.png`，与 tray 图标同机制），`files` 里 png 条目同步移除。dev 下 `getAppPath()` 断言与 Linux 打包实测待真机补证。

### 追记（2026-10-19）：1.0.1-beta 已含全部修复，但用户仍报 Electron——逐项排除表

现象：registry 显示已装 `Spherse 1.0.1-beta`（`D:\note\Spherse`，文件 mtime 当日 02:01，进程 02:19 启动），任务栏仍显示 Electron。

| 检查项 | 结果 | 结论 |
|---|---|---|
| 安装包内 AUMID 修复 | asar chunk 含 `resolveAppUserModelId` + packaged-only 门 | ✅ 在包内 |
| 安装包内 window 图标修复 | chunk 含 `resolveWindowIconPath`（win32 省略），无旧 `__dirname...build` 串 | ✅ 在包内 |
| exe 内嵌图标 | `ExtractAssociatedIcon` hash == 仓库 ico 32px（`5987E9…`） | ✅ 正确 |
| 开始菜单快捷方式 | target/icon 正确，`AppUserModelID = com.spherse.app` | ✅ 正确 |
| 桌面快捷方式 | target 正确 | ✅ 正确 |
| 任务栏固定项 | `User Pinned\TaskBar` 无 Spherse | ✅ 无残留 |
| JumpList（AutomaticDestinations 84 个，字节级 UTF-16/ASCII 双查） | 无 `electron.exe`/`Spherse.exe` 引用 | ✅ 干净 |
| 多安装 | Program Files 无，卸载表唯一，`InstallLocation` 为空 | ✅ 单一安装 |
| 运行进程 | 6× `Spherse.exe` 全为安装路径，无 `electron.exe` | ✅ 本体在跑 |

结论：应用侧 + 快捷方式 + 固定 + 跳表 + 安装唯一性**全部无问题**。剩余可能只剩两类：① **时间差**——上报早于重装/重启（02:01 装、02:19 起），看到的是旧态；② **Explorer 侧不可查状态**（运行中按钮的图标缓存/分组缓存）。下一步只问用户三件事（见正文回复），不再查代码。

### 追记二（2026-10-19）：用户确认是新态、无固定、次次复现——活窗口取证

用户澄清：上报为当前态；从未固定过；每次打开都错。遂对**运行中窗口本身**取证（Win32 只读，无执行）：

- 可见顶层窗口唯一：`"Spherse"`（其余 5 个进程无可见窗口），即主窗口。
- `WM_GETICON`（SMALL2/SMALL/BIG）全返回 0：窗口**没有显式图标**，与新代码 win32 省略一致，fix 已生效。
- `GetClassLong` small/big 返回**同一非零句柄**；`GetIconInfo` 量得原生 **40x40**（125% DPI 下 32 的缩放值，无诊断意义）。
- 像素比对（同管线渲染，尺寸归一后可比）：live 图 ≠ Spherse-16/32/40/48 任一渲染（`5987E9…` 家族），≠ stock electron-32（`74D479…`）；exe 内仅 1 组图标（Spherse）。
- 结论：回退行为不符合“省略即用 exe 图标”的预期——窗口实际携带了一个**身份不明的非 Spherse 图标**（Electron 系嫌疑最大但未锤死；颜色取证被 GDI+ 透明度行为污染，不可作数）。

决策修正：**决策 B（win32 省略）的前提被证伪**，改回显式设图标——win32 用 extraResources 落盘真文件（与 tray 同机制），`resolveWindowIconPath` 只改 win32 分支返回值（ico；dev 走包内同名 ico）。判别性验证见追记三。

### 追记三（2026-10-19）：显式图标已实施 + 打包验证通过，待用户真机验收
> 2026-10-19 晚更新：用户所测版本经查**不是含修复的构建**，下述“无效”结论全部作废，见追记四。

### 追记四（2026-10-19）：用户测的一直是旧构建 + 神秘图标身份落定

- 版本取证：`D:\note` 在装版 registry 为 `1.0.1-beta`，asar 主 chunk 为 `main-C3wVGKtd.js`，逐段确认为 omit 版（`win32 → void 0`）；含显式 ico 的 `main-CLsy0KPa.js` 只存在于本地 `release/` alpha 包（`Spherse-Setup-1.0.1-alpha-x64.exe`，113MB），从未被安装运行。registry 非 alpha 即铁证。
- 活窗口图标取证（2026-10-19 晚，进程 20:29 版）：`WM_GETICON` small/big 非零但两把柄不同；逐像素比对同管线渲染，@125% DPI 下 DrawIconEx-32 与 Spherse-16/32/48/64/128、stock-electron-16/32、IDI_APPLICATION 全不等；exe 内仅 1 组图标；40x40 原生尺寸系 DPI 缩放假象（32@125%），无诊断意义。
- 结论：旧构建（坏路径/省略）从未给窗口设过有效图标，活窗口图标是 Chromium 编译内置默认（跨构建跨重启像素一致：small `81A596…`、big `4988D7C6…`）；“省略即回退 exe 图标”的假设作废，这正是决策 B 被推翻的技术注脚。显式 ico 版是否生效，只能由安装本地 alpha 的真机一眼判定，此前一切“无效”报告针对旧构建，一律作废。

- 实现：`window-icon.ts` 全平台显式返回（win32 → `resources/spherse-icon.ico`，其他 → `resources/spherse-icon.png`，dev 走包内 `build/` 同名文件）；`window.ts` 简化为直接传 `icon`；`electron-builder.yml` extraResources 加 ico 条目；单测同步到 4 用例。
- `npm run pack --dir` + `npm run dist:alpha` 双验证：`resources/` 下 ico（107414）+ png 双落盘；新 chunk（`main-CLsy0KPa.js`）含 ico 分支、无旧坏路径；desktop 全套件 24 文件 / 260 用例通过；产物 `release/Spherse-Setup-1.0.1-alpha-x64.exe`（113MB）。
- 远程排查已到极限：exe 图标/AUMID/快捷方式/固定/跳表/单安装/运行进程 8 项全绿；活窗口 `WM_GETICON` 全零（符合省略逻辑）但类图标身份无法 headless 确认；本机截屏看不到任务栏（自动隐藏）。最终判别只能真机看一眼：装 alpha → 从开始菜单启动 → 看任务栏。
- 2026-10-19 晚修正：上述“无效”报告针对的构建经查**不含本次修复**（见追记四）；活窗口图标之谜同步解开，详见下。
- 2026-10-19 澄清“依旧无效”：用户测的 `D:\note` 版 asar chunk 为旧 omit 版（`win32 → void 0`），即 CI beta（02:01 装）早于显式 ico 改动（`91345b8`）；本地新 alpha（`release/Spherse-Setup-1.0.1-alpha-x64.exe`，13:50，`main-CLsy0KPa.js` 含 ico 分支 + `resources/` 双落盘）从未被安装运行过。待用户装本地 alpha 重验，此前一切“无效”结论针对的都是旧构建。

### 追记五（2026-10-20）：真凶是开始菜单里的 `Electron.lnk`，与图标管线无关

- 决定性证据（用户补充）：右键任务栏显示的名字就是 `Electron`。沿身份链查到：开始菜单 `Electron.lnk`（2026-09-13，dev 时期无条件 `setAppUserModelId` 时 Windows 自动生成），target=`node_modules/electron/dist/electron.exe`，`System.AppUserModel.ID=com.spherse.app`——与 `Spherse.lnk` 同 ID；`Get-StartApps` 对该 ID 只返回 `Name=Electron`（无 Spherse）。任务栏按 AUMID 反查快捷方式（字母序 Electron 在前），图标+右键名全跟它走；标题栏走窗口图标，所以红实验标题栏变红而任务栏不动。10-18 的 packaged-only AUMID 只防新增不清存量；图标缓存/固定/跳表排查全是干净的，因为错的从来不是缓存。
- 验证：`Electron.lnk` 改名 `.bak` + 重启 explorer，`Get-StartApps` 变 `Name=Spherse`，安装版任务栏/右键恢复正常。
- 修复（dev，待发版）：`electron/stale-electron-shortcut.ts`——纯函数谓词（文件名=`Electron.lnk` 且 AUMID=ours 且 target 含 `electron.exe` 三者同时满足才删；`Spherse.lnk`/异 ID/异 target/不可解析一律保留）+ `removeStaleElectronShortcut`；`main.ts` `whenReady` 首行调用（门复用 `appUserModelId` 非空，即仅 packaged+win32）；`window.ts` `createWindow` 后 `setAppDetails({appId, appIconPath: ico, relaunchCommand, relaunchDisplayName: "Spherse"})` 做防御。单测 12 用例；解析器另用真机 `Electron.lnk`/`Spherse.lnk` 实测验证（删对留对）。
- 附带：真 lnk 的 PropertyStore 非标准布局——pid 与 type 间有 1 pad 字节、长度字段是字符数而非字节数；解析器双兼容（单测 `windowsStyleStore` 锁定）。
- 范围：清理仅 per-user 开始菜单单文件（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Electron.lnk`），不动 Common 分架与子目录；dev（AUMID 为空）不执行。

### 追记三（2026-10-19）：改回显式图标 + 打包验证通过

- 实现：`resolveWindowIconPath` 改为全平台显式返回路径（win32 → `resources/spherse-icon.ico`，其他 → `resources/spherse-icon.png`；dev 走包内 `build/` 同名文件）；`window.ts` 简化为直接传 `icon`；`electron-builder.yml` extraResources 追加 ico 条目（`files` 里 png 条目同步移除，asar 内路径不可靠）；单测同步到 4 用例。
- `npm run pack --dir` 验证：`resources/spherse-icon.ico`（107414）+ `.png` 双落盘；新 chunk（`main-CLsy0KPa.js`）含新逻辑；desktop 全套件 24 文件 / 260 用例通过。
- 事故记录：排查中一次 `asar extract-file package.json` 实际落盘到了仓库根，覆盖了根 `package.json`（内容变为 desktop 包），导致 `predist-contract` 误报 1 失败；已用 git 恢复，复跑全绿。教训：asar 取文件必须显式确认 cwd，事后以 `git status` 为准。

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

## 五、默认模型“请先配置 API”（2026-10-19，merge144 回归，与本次 triage 同目录备查）

### 现象

设置 API 页显示 API 已配置（由旧版本迁移，徽章正常），但默认模型配置处显示“请先配置 API Key”（`settings.models.configureFirst`）；agent 默认模型、session 模型选择均正常。

### 根因

- `use-settings-form.ts:85-91`、`114-123`：`apiKeys` 在加载与保存回执后恒为 `{}`——server 化 + 脱敏后 key 永不下发（by design），下来的只有 `configured` flags。
- `DefaultModelField.tsx:33`：`configuredProviders = providers.filter(([id]) => apiKeys[id]?.trim())`——拿永远为空的 `apiKeys` 做门，而不用 `configured`。于是服务端存 key 的用户（迁移用户首当其冲）永远看到“请先配置”。
- 对照正常方：`ModelProviderItem`（`settings/index.tsx:169-170`）用 `configured` 布尔 → 徽章正确；agent-dialog（`ModelConfigField.tsx:59`）用 `configuredIds` 集合 → 正常；session 选择读 catalog → 正常。
- merge144 之前 key 存 electron-store 本地可读，门是通的；server 化后断掉，属回归。

### 修复方向（2026-10-19 已实施，审查后加严两处）

- 给 `DefaultModelField` 加 `configured: Record<string, boolean>` prop，过滤改为 `apiKeys[id]?.trim() || configured[id] || providers[id]?.keyless`（新手工输入走 `apiKeys`，已迁移走 `configured`，免密钥走 `keyless`——与 `SessionModelPill.tsx:89` 判据对齐）。
- `loadError` 时不显示“请先配置”提示（错误横幅已说明，避免误导）。
- agent 侧同批修：`AgentDialogForm.tsx` 的 `configuredIds` 改为 stored-configured 与 catalog-keyless 的并集（之前只遍历 settings 条目，keyless 供应商根本不在其中）。
- 测试：新增 `DefaultModelField.test.tsx`（4 用例）；`AgentDialogForm.test.tsx` 加 keyless 用例（覆盖到 `configuredIds` 构建）。
