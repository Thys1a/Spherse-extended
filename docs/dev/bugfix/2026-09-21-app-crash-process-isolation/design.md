# 应用闪退：进程隔离 + 输入上限 + 崩溃自愈

调研时间：2026-09-21
现场：项目 `D:\note\AINovelGame\games\spherse框架`，agent `assistant-acb0db`，会话库 `.spherse/agents/assistant-acb0db/sessions.db`；应用 `D:\note\Spherse\Spherse.exe`（Electron，用户数据 `%APPDATA%\Spherse`）
状态：**修复草案（未实施）**

## 一、现象

用小助手 agent 连续修改游玩屏时，软件整体退出（窗口消失），不是白屏/灰屏，随后重开继续。集中在需要一次性读取多份 HTML 的回合。

## 二、证据

### 2.1 会话库（events 表）

库体量：`sessions.db` 29 MB，events 6,043 行；`tool/result` 单条最大 818,768 B，`assistant/message` 单条最大 67,763 B。

同一「调整游玩屏」任务当天跑了 4 次，全部异常中断，且都停在「读完文件、尚未写入」之前：

| 会话 | 时间 | 结束 | 备注 |
|---|---|---|---|
| `58719d8e` | 16:21–17:45 | aborted / error | 多次 `turn/retried` |
| `bf2f7359` | 17:46–18:12 | error | |
| `38b4d16c` | 18:13–19:03 | aborted / error×2 | 用户「又闪退了，继续执行」 |
| `107d618e` | 19:04–19:09 | aborted | 读完 5 份 HTML 后中断 |

单次读取体量只有 10–50 KB，所以「单次读得太多」不成立；`turn/end=aborted|error` 是重启后补记，指认不了进程类型。

### 2.2 应用侧

- 应用为 Electron（`resources/app.asar` 95 MB，内含 SDK 文档）。
- SDK 文档（`spherse-use-ui-sdk`）：聊天 HtmlCard 内的 `<spherse-chat>` 占位元素会 **auto-dock** 聊天面板；面板尺寸/位置完全跟随占位元素几何位置；**占位元素被移出文档或页面卸载时面板才关闭**。
- 推论：用 `display:none` 隐藏占位元素的祖先，只让占位仍在文档里、面板停在旧位置——游玩屏曾因此让聊天窗残留在欢迎页旁（已改用 `undockChat()`）。

## 三、判定（待 reason 证实）

整窗消失指向 **main（Node）进程**；renderer 单独崩一般只是白屏/灰屏。主要嫌疑：

1. main 内存压力：一次性把大 blob（events / tool result）读入内存，或渲染时持有大字符串。
2. 原生模块（SQLite）出错或段错误。
3. renderer 崩溃后由回调触发整应用退出（`app.quit()`，或未挂 handler）。
4. 上游调用 / 工具异常冒泡成 main 未捕获异常。

以上均为假设，须先取证。

## 四、修复方案

### 阶段一（P0）取证：先知道死的是哪个进程

```js
// main
crashReporter.start({ submitURL: "", uploadToServer: false });

app.on("render-process-gone", (_e, wc, d) =>
  logCrash({ proc: "renderer", reason: d.reason, exitCode: d.exitCode, url: wc.getURL() }));
app.on("child-process-gone", (_e, d) =>
  logCrash({ proc: d.type, reason: d.reason, exitCode: d.exitCode, name: d.name }));
app.on("gpu-process-crashed", (_e, killed) => logCrash({ proc: "gpu", killed }));

process.on("uncaughtException", (err) => {
  logCrash({ proc: "main", kind: "uncaughtException", stack: err && err.stack });
});
process.on("unhandledRejection", (r) => {
  logCrash({ proc: "main", kind: "unhandledRejection", stack: r && r.stack });
});
```

判定表：

| reason | 优先方向 |
|---|---|
| `oom` | 内存与截断（阶段三）|
| `crashed` 且无 JS 异常 | 原生模块 / GPU（阶段二、五）|
| `killed` | 外部 / 系统 OOM killer（阶段五）|
| `launch-failed` | 进程创建 / 权限 / 打包资源 |

`logCrash` 落盘到固定日志目录，字段含时间、进程、reason、exitCode。验收：故意抛异常与故意触发 renderer OOM，日志都能看到对应 reason，且 `uncaughtException` 不直接终止 main。

### 阶段二（P0/P1）进程隔离 + 崩溃自愈

#### 2.1 渲染不可信 HTML

- 游玩屏 / 预览放进独立 `BrowserWindow` 或 `WebContentsView`：`sandbox:true`、`contextIsolation:true`、独立 `session`。
- 挂 `render-process-gone` → `reload()` / 重建，主窗口无感。
- 避免「崩溃回调里 `app.quit()`」的写法。
- 预览用独立 session：拦 `will-attach-webview`、设 CSP、禁远程 `@import` 与越权 `file:`。
- 给 renderer / 预览设内存上限。

#### 2.2 Agent 运行时

- LLM 循环 + 工具执行（`read_file` / `write_file` …）放 `utilityProcess.fork()` 或 Node 子进程，UI 只走 IPC。
- 模型或工具出错只影响子进程，主进程负责重启与提示。

验收：注入一次子进程崩溃，主窗口保持可用。

### 阶段三（P1）输入与资源上限

- `read_file` 强制 `offset / limit`，超长截断并在结果里回报「已截断」。
- 每回合设 token 预算与工具结果总量上限，超限走摘要 / compaction（复用 `compactions` 表）。
- 每个 tool call、每次模型请求包 `try/catch` + 超时 + `AbortController`，异常转成「工具返回错误」。
- 会话库治理：WAL checkpoint、按会话裁剪、查询分页，避免一次性把大 blob 读进内存。

验收：读取超大文件时 context 不爆、main 内存曲线平稳。

### 阶段四（P2）内容侧加固

针对「碎影那套正好踩雷」的行为：

- 禁 `@import` 远程字体（或改本地字体）。
- 禁开屏自动联网（播放器第三方 API 检索改为点击触发）。
- 取消 `file:update` → `location.reload()` 的整页重载，改为局部刷新并节流防重载循环。
- 预览默认不执行脚本，或只在沙箱窗口执行。

验收：打开游玩屏时无远程请求、无整页重载循环。

## 五、无法根治项

原生模块 segfault、GPU / 驱动崩溃、系统 OOM killer 在代码层面躲不掉。策略是子进程隔离 + 崩溃后重建，把影响压到「某个面板重载」，不升级为整应用关闭。

## 六、验收标准

1. 故意崩溃注入后，应用不整体退出。
2. `reason=oom` 场景只触发面板 / 子进程重建。
3. 崩溃日志含进程类型、reason、exitCode、时间。
4. 游玩屏打开无远程请求、无重载循环。

## 七、落地顺序

| 优先级 | 内容 | 依赖 |
|---|---|---|
| P0 | 取证（阶段一）| 无 |
| P0 | 渲染隔离 + 崩溃自愈（2.1）| 阶段一 read reason |
| P1 | Agent 运行时隔离（2.2）| 2.1 |
| P1 | 输入上限（阶段三）| 2.2 |
| P2 | 内容侧加固（阶段四）| 无 |
| P2 | 原生 / GPU 兜底（阶段五）| 2.1 |

核心原则：main 只留窗口与 IPC，渲染和 agent 循环都进子进程，再叠输入上限与崩溃自愈。优先级由阶段一的 reason 决定。

## 关联

- `docs/dev/investigation/2026-08-29-htmlcard-iframe-trust`
- `docs/dev/investigation/2026-08-28-server-browser-security`
- `docs/dev/investigation/2026-08-28-web-disabled-features`
- `docs/dev/bugfix/2026-08-29-e2e-app-close-hang`
- `docs/dev/bugfix/2026-09-21-empty-turn-on-context-overflow`
- `docs/dev/decisions/0004-persist-before-callback.md`
- `docs/dev/decisions/0008-no-frontend-auto-retry.md`
