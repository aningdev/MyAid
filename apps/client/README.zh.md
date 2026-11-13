# @myaid/client

[English](README.md) | 中文

NSH 桌面 / 移动客户端，纯 TSX：`App.tsx` 入口，没有 Rust crate（[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)）。拥有 Workspace Shell（扁平 Bot 列表 + Pane 分屏）、Bot 注册表、官方 dsh 协议客户端与回环控制面客户端。产品形态见 [BLUEPRINT](../../docs/BLUEPRINT.md)，决定见 [ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md)。架构与 DSH 边界：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。编码护栏：[AGENTS.md](AGENTS.md)。

Bundle id：`com.aningdev.myaid`（见 `nsh.json`）。目录形状沿用 `nsh init`（[project structure](https://nsh.dev/docs/project-structure.md)）。

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── shell/                  # Navigator（扁平 Bot 列表）、Pane 分屏、设置覆盖层、命令表、偏好、注意
│   └── ui/                     # 样式化基础层（唯一包装 nsh/base）
├── features/                   # bots（注册表、Pane、详情弹窗）、dialogue（chat、段）、workspace、settings
├── lib/                        # dsh、host、relay、background
├── screens/                    # open(…) 入口、截图、真 Host 冒烟（opt-in）
├── nsh.json                    # plain TSX: no "rust" key
└── assets/
```

## 命令

根目录用 `vp run`（勿用 `bun --cwd`）：

```sh
vp run @myaid/client#check
vp run @myaid/client#dev              # = dev:macos
vp run @myaid/client#dev:macos
vp run @myaid/client#dev:web
vp run @myaid/client#dev:ios
vp run @myaid/client#dev:android
vp run @myaid/client#dev:server       # nsh dev --server-only
vp run @myaid/client#test
vp run @myaid/client#build            # bytecode（nsh build）
vp run @myaid/client#package:macos    # .nsh/out/MyAid.app
vp run @myaid/client#package:web
```

- 日常改 UI：`nsh run --target …`（上面的 `dev*` 脚本）。
- 只起服务、自己连模拟器或已开宿主：`dev:server`。
- `package:macos` 产出 NSH 可安装 `.app`，**不是**根级成品（App + Host + `SMAppService` 组装另议）。
- 真 Host 冒烟是 opt-in：未设置 `MYAID_SMOKE_HOST` 时 `screens/*.smoke.test.tsx` 直接返回；它也是测试应用接触本机控制面的唯一入口（`test/open.ts` 打开的应用既不探活也不 spawn）。见 [screens/README.md](screens/README.md)。
- 打开 app 的测试统一走 [`test/open.ts`](test/open.ts)：host 参数让注册表与 shell prefs 使用测试 app 自己的 Storage，绝不碰真实 `~/.myaid`。

## 壳

- **Navigator**：左侧可收缩 `ResizablePanel`（默认 232，最小 160，最大 480），顶行承接隐藏标题栏的拖拽；下面是搜索框（`⌘F`）、**Pin** 组、其余 Bot 按最近活动排序（工作中的点、未读数、待审批点）、**新建 Bot**（`⌘N`）；底部是 Host 状态与 **⚙ 设置**（`⌘,`）。没有域分区、没有树、不在 Bot 下展开会话。右键给该 Bot 的动词：Pin / Bot 详情 / 重命名 / 归档；归档的 Bot 退出列表，搜索仍能找到并 **Unarchive**。
- **Pane**：`nsh/base` DockArea（center）。一个 Pane 显示一个 Bot 的对话；点行把内容开到活动 Pane，向右拖入在工作 Pane 右侧开新 Pane，已有 Pane 的 Bot 只切焦点。拆分（向右 / 向下）、拖动分隔线、放大、关闭与焦点快捷键来自 DockArea 与命令表。布局、每个 Pane 的 Bot 与活动 Pane 从客户端偏好恢复；Bot 不在则该 Pane 为空。没有标签页。
- **Pane 标题**：Bot 标记（工作中呼吸）、名字、工作目录（点一下可改，换成别的目录会开新段），然后是 **Bot 详情** 与拆分 / 放大 / 关闭并排。Pane 主体是对话，段的事实收在弹窗里。
- **Bot 详情**（`features/bots/BotDetails.tsx`）：盖在 Pane 上的一个弹窗——Profile / Runs with / Skills / Plugins、当前段的工作目录、模型、用量 / 上下文与 dsh 的 **Compact**，以及删除 / 归档。Profile 与 Runs with 写注册表偏好；Skills 与 Plugins 读该 Bot 的 preset 组成，preset writer 可用时派生它自己的 preset，否则如实说明写不了。
- **设置**：整页覆盖在 Pane 之上（Pane 的布局、滚动与草稿都还在）。左栏是 **模型供应商 / 通用 / 后台 / 关于**；Back 或 Esc 返回。
  - **模型供应商**（`features/settings/ModelProviders.tsx`）：列出 dsh 报告的每个供应商（`llm.listProviders` 合并 `llm.listConfigurableProviders`）与它的 Key 状态。Key 只经 `credentials.describe/set/unset` 写入供应商设置命名空间指定的引用（没有时用 dsh 的 `<ROUTE>_API_KEY` 推导）；页面不保存 Key。供应商字段（base URL 起）与默认模型经 `settings.describe/update` 写入——默认模型在 dsh 描述的 `agent-default-model` 命名空间里，不是写死的清单。没有 Host 时说明原因、不提供输入。
  - **通用**：语言行（简体中文 / English / 跟随系统；现在只保存，L4 语言包生效）、外观（跟随系统 / 浅色 / 深色）与强调色。立即生效，并保存在客户端偏好里。
  - **后台**：Host 与 dsh web 的相位、Host 自身版本、dsh 实际版本与要求版本（不一致时两者并列并说明 Host 拒绝启动）、最近错误、启动 / 停止 / 重启 dsh，以及 Background Services 登记面板。
  - **关于**：MyAid / Host / dsh 版本与 **复制诊断信息**（只有版本与连接状态，没有 Key、令牌或会话内容）。
- **对话**：一个 Bot 的 Pane 就是它的那条长对话，按时间把段（Session）连成一条连续 transcript。段与段之间的分隔线写日期与工作目录；滚到顶部时，更早的段与段内更早的页都经官方 Session 模型加载。右侧历史轨每段一个刻度（当前段高亮）：悬停显示名称与时间，点击跳到该段开头；整条轨道是一个键盘停点，↑ / ↓ / Return 可用，并带 VoiceOver 标签。只有最新段接受输入，旧段可复制、可定位。命令面板的 **新话题** 或 `/new` 在当前目录开新段；在标题处改工作目录就在新目录开新段。接近上下文上限时 **Compact** 留在同一段内。没有段的 Bot 可以在默认工作目录开始第一段。
- **运行态归属**：dsh 状态归官方 React-free client model（`ctx.sessions`：列表、事件窗口、follow、分页、prompt / queue / cancel、投影；`ctx.workspaces`：行、顺序、归档、置顶）。`SessionController` 只保留产品新增的部分——草稿、附件、审批展示、本地这一轮（`TurnProjection`）与 Pane 视图。两个 Pane 的两条 Session（跨 Workspace）可并行流式。

| 快捷键       | 动作                     |
| ------------ | ------------------------ |
| `⌘N`         | 新建 Bot                 |
| `⌘,`         | 设置                     |
| `⌘K`         | 命令面板                 |
| `⌘F`         | 搜索 Bot 列表            |
| `⌘B`         | 收起 / 展开 Navigator    |
| `⌘\` / `⌘⇧\` | 向右 / 向下拆分活动 Pane |
| `⌘[` / `⌘]`  | 上一个 / 下一个 Pane     |
| `⌘W`         | 关闭 Pane                |
| `⌘.`         | 停止执行中的一轮         |
| `⌘L`         | 聚焦 composer            |

`components/shell/commands.ts` 是键盘、应用菜单与命令面板共用的唯一命令表。`components/shell/attention.ts` 把不在前台的段的回复结束或新审批变成系统通知（说的是 Bot 名）与 Dock badge；点通知把那个 Bot 开进 Pane。

## 数据

- 注册表：桌面 `~/.myaid/registry/bots.json`；web / 移动走 `nsh` Storage（`myaid.registry.bots`）。版本 6 存 templates 与 Bots；每个 Bot 用 `segments`（`sessionId` + `workspaceId` + 人对它的称呼）按时间从旧到新持有它的一条长对话。v3 / v4 / v5 文件在连上 Host 前只读：迁移把该 Bot 的旧 Dialogue 按认领顺序并成一条长对话，每段保留自己的 Workspace id，并在 dsh 里**取消归档旧 Session**，让历史完整；写新文件前先备份旧文件为 `bots.json.v<旧版本>.bak`。Identity、归档位与段的认领在注册表（[ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md)）；Workspace 路径、名字、Session 顺序与归档归 dsh（[ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md)）。
- Workspace 与 Session：官方 `ClientWorkspaceModel` / `ClientSessions` 装在 Connection 的 Cordis Context 上（`lib/dsh/connection.ts`），每个 Host generation 原子替换它们的 snapshot。`features/workspace` 与 `features/dialogue/session` 只把 snapshot 投影成 NSH signal；Remote 的返回不写这份状态。它们的浏览器 `__ModuleLoader__` 产物由 `prepare:sdk` 展开成静态 ESM（`lib/dsh/generated/`），因为 NSH 不运行字符串代码。
- 客户端偏好：桌面 `~/.myaid/prefs/client.json`；其他目标走 Storage（`myaid.prefs.shell`）。版本 2 覆盖 Navigator 的宽度与开合、Pin 的 Bot 顺序、Pane（布局、每个 Pane 的 Bot、活动 Pane）与通用页的外观和语言（旧文件读默认值）。版本 1 文件只读一次：Bot pin 保留，Dialogue / Session pin 变成它所属 Bot 的 Pane，Session pin 本身丢弃。聊天发送键是独立的 Storage 键（`myaid.prefs.sendKey`）。
- `capabilities.fs` 只授 `${homeDir}/.myaid` 读写。附件走系统选择器；授权外的拖放与粘贴退回同一个选择器 —— 见 [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md)。

## 已知限制

- 窄窗只显示移动提示页；桌面壳从 700 pt（desktop idiom）/ 900 pt（其他）起。
- 界面没有段级归档 / 删除；归档的是 Bot，段与日志都保留。
- 壳的文案仍是中英混合；双语在 L4 统一。设置页的语言行只保存选择，语言包落地前不切换文案。
- dsh 的 Session 模型目录受凭据门控：没有可用 Key 时目录为空，默认模型卡片退回各供应商设置里公布的 `models` 与当前选择。见 [ARCHITECTURE §4](../../docs/ARCHITECTURE.md)。
- Host 未挂载 `myaid-plugin-bot-presets` 时 Bot 详情存不了 Skills / Plugins 变更：没有别的 Remote 能写 Agent preset 正文。见 [ARCHITECTURE §4](../../docs/ARCHITECTURE.md) 的缺口表。
- 客户端阻塞时 dsh mux 可能因错过两次心跳断开；Session controller 会重跟（3 次、退避）。细节见 [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md)。

## 原生层：App 自己启动的 Host（仅本机桌面）

本应用没有 Rust（[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)）。Host 是 `127.0.0.1:4872`（`MYAID_HOST_PORT`）上的回环 HTTP + 一个 WebSocket，用 `<数据根>/host/serve-token` 认证；Relay 有自己的 `127.0.0.1:8787` 与 `relay/serve-token`。

- `lib/host/launcher.ts`：没有 Host 就起（`myaid-host serve-app`），有就复用，退出后 1 秒起、翻倍到 15 秒重启；要求 `myaid-host` 在 `PATH` 上（`cargo build -p myaid-host` 产出在 `target/debug`，`scripts/run-with-host-path.mjs` 为 `dev` / `dev:macos` 把它放前面）。日常用根目录 `bun run dev`，它先构建 Host。
- `lib/host/client.ts` 是传输（`fetch` + 标准 `WebSocket`）；`lib/host/control.ts` 是产品面（`ensureBackendReady`、`resolveDshLoginUrl`、`watchHostStatus`）。Host 的公开状态还带 `hostVersion` 与 guardian 实际找到的 `dshVersion`，供后台与关于页显示。
- 启动器起不来时，侧栏页脚就是 Host 空状态：原因 + 手动的 `myaid-host serve-app`。
- `dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` 不起 Host——移动端经 Relay，不走本机 Host。

## 相关

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) —— 客户端结构与 dsh 缺口表。
- [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md) —— 回环 Cookie 引导与 mux 心跳限制。
- [ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md) / [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md) —— identity 归注册表；`fs` 只授应用数据。
- [screens/README.md](screens/README.md) —— 截图与 opt-in 真 Host 冒烟。
