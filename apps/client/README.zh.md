# @dsh-bot/client

[English](README.md) | 中文

NSH 桌面 / 移动客户端，纯 TSX：`App.tsx` 入口，没有 Rust crate（[0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)）。拥有 Workspace Shell（扁平 Bot 列表 + Pane 分屏）、Bot 注册表、官方 dsh 协议客户端与回环控制面客户端。产品形态见 [personal-agent spec](../../docs/specs/2026-11-20-personal-agent.md)，决定见 [GLOSSARY](../../docs/GLOSSARY.md)。架构与 DSH 边界：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md)。编码护栏：[AGENTS.md](AGENTS.md)。

Bundle id：`com.aningdev.dshbot`（见 `nsh.json`）。目录形状沿用 `nsh init`（[project structure](https://nsh.dev/docs/project-structure.md)）。

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── shell/                  # Navigator（扁平 Bot 列表）、Pane 分屏、设置覆盖层、命令表、偏好、注意
│   ├── app/                    # 用 shadcn-nsh 组件拼的产品组合（Appear、IconTile、ImageViewer、OptionSegmented、Shortcut）
│   └── ui/                     # shadcn-nsh 复制件（只经其 CLI add）；theme.json 即主题
├── features/                   # bots（注册表、Pane、详情弹窗）、tickets、dialogue（chat、段）、workspace、settings
├── lib/                        # dsh、host、background
├── screens/                    # open(…) 入口、截图、真 Host 冒烟（opt-in）
├── themes/                     # shadcn-nsh `add theme-*` 的复制件（`default/`：其自带配色；`shadcn/`：构建时主题的同一套，包成 `AppTheme`）
├── nsh.json                    # plain TSX: no "rust" key
└── assets/
```

## 命令

日常用根目录 `bun run dev [target]`：它先核对 `node_modules`、重建过期的 Host，再调下面这些脚本。

根目录用 `vp run`（勿用 `bun --cwd`）：

```sh
vp run @dsh-bot/client#check            # nsh check + nsh build + ui:diff
vp run @dsh-bot/client#dev              # 桌面端，会拉起 Host
vp run @dsh-bot/client#dev:macos        # 另有 dev:windows / dev:linux / dev:gpui
vp run @dsh-bot/client#dev:web
vp run @dsh-bot/client#dev:mobile       # Mac Catalyst
vp run @dsh-bot/client#dev:ios
vp run @dsh-bot/client#dev:android
vp run @dsh-bot/client#dev:server       # nsh dev --server-only
vp run @dsh-bot/client#test             # 所有测试文件，NSH_TEST_JOBS 个并行；带参数时即 nsh test
vp run @dsh-bot/client#build            # bytecode（nsh build）
bun run ui:diff                         # components/ui 对照 shadcn-nsh registry（见 check）
vp run @dsh-bot/client#package:macos    # .nsh/out/dsh-bot.app，打包后运行
vp run @dsh-bot/client#package:web      # 另有 package:windows / linux / gpui / ios / android
```

- 日常改 UI：根目录 `bun run dev [target]`；上面这些是它调用的低层脚本。
- 只起服务、自己连模拟器或已开宿主：`dev:server`。
- `package:macos` 产出 NSH 可安装 `.app`，**不是**根级成品（App + Host + `SMAppService` 组装另议）。
- 真 Host 冒烟是 opt-in：未设置 `DSH_BOT_SMOKE_HOST` 时 `screens/*.smoke.test.tsx` 直接返回；它也是测试应用接触本机控制面的唯一入口（`test/open.ts` 打开的应用既不探活也不 spawn）。见 [screens/README.md](screens/README.md)。
- `test` 每个文件起一个 `nsh test <file>` 并行跑（`NSH_TEST_JOBS`，默认核数减 1，最多 8），长的先跑；分层、预算和交付前跑什么见 [testing](../../docs/architecture/testing.md)。只有原生能证明的按文件跑：`nsh test --target macos <file>…`。
- 打开 app 的测试统一走 [`test/open.ts`](test/open.ts)：host 参数让注册表与 shell prefs 使用测试 app 自己的 Storage，绝不碰真实 `~/.dsh-bot`。

## 壳

- **Navigator**：左侧可收缩的 shadcn-nsh `ResizablePanel`（默认 232，最小 160，最大 480），顶行承接隐藏标题栏的拖拽；下面是搜索框（`⌘F`）、**Pin** 组、其余 Bot 按最近活动排序（工作中的点、未读数、待审批点）、**新建 Bot**（`⌘N`）；底部是 Host 状态与 **⚙ 设置**（`⌘,`）。没有域分区、没有树、不在 Bot 下展开会话。右键给该 Bot 的动词：Pin / Bot 详情 / 重命名 / 归档；归档的 Bot 退出列表，搜索仍能找到并 **Unarchive**。
- **Pane**：shadcn-nsh 的 `DockArea`（center）。一个 Pane 显示一个 Bot 的对话；点行把内容开到活动 Pane，向右拖入在工作 Pane 右侧开新 Pane，已有 Pane 的 Bot 只切焦点。拆分（向右 / 向下）、拖动分隔线、放大、关闭与焦点快捷键来自 DockArea 与命令表。布局、每个 Pane 的 Bot 与活动 Pane 从客户端偏好恢复；Bot 不在则该 Pane 为空。没有标签页。
- **Pane 标题**：Bot 标记（工作中呼吸）、名字、工作目录（点一下可改，换成别的目录会开新段），然后是 **Bot 详情** 与拆分 / 放大 / 关闭并排。Pane 主体是对话，段的事实收在弹窗里。
- **Ticket 与 Attention**：Bot 的 Pane 顶部是它执行过的 Ticket（标题、状态、最后更新）；打开 Ticket 看它自己的 Session（可读、可回复）与它等待的 Attention，这个 Session 不会成为该 Bot 的段。Navigator 的 **Needs you** 行数出本 Device 上所有 pending Attention 并打开收件箱；问题可选一个或多个选项，也可补充自定义回答，审批可选 Allow 或 Reject，都经 `tickets` Remote（`answer`、`cancel`），所以回答后所有 Device 的列表里都会消失。不做推送：Client 打开时 Attention 才会提醒。
- **Bot 详情**（`features/bots/BotDetails.tsx`）：盖在 Pane 上的一个弹窗——Profile / Runs with / Skills / Plugins、当前段的工作目录、模型、用量 / 上下文与 dsh 的 **Compact**，以及删除 / 归档。Profile 与 Runs with 写注册表偏好；Skills 与 Plugins 读该 Bot 的 preset 组成，preset writer 可用时派生它自己的 preset，否则如实说明写不了。
- **设置**：整页覆盖在 Pane 之上（Pane 的布局、滚动与草稿都还在）。Runner 本机桌面 Client 的左栏是 **模型供应商 / 通用 / 后台 / 设备 / 关于**；Device 上 **设备** 换成 **这台设备**（`components/shell/host.ts` 的 `hasHost`）。窗口窄于 600 pt 时，这栏改到顶部换行。Back 或 Esc 返回。
  - **模型供应商**（`features/settings/ModelProviders.tsx`）：列出 dsh 报告的每个供应商（`llm.listProviders` 合并 `llm.listConfigurableProviders`）与它的 Key 状态。Key 只经 `credentials.describe/set/unset` 写入供应商设置命名空间指定的引用（没有时用 dsh 的 `<ROUTE>_API_KEY` 推导）；页面不保存 Key。供应商字段（base URL 起）与默认模型经 `settings.describe/update` 写入——默认模型在 dsh 描述的 `agent-default-model` 命名空间里，不是写死的清单。没有 Host 时说明原因、不提供输入。
  - **通用**：语言行（跟随系统 / 简体中文 / English）、外观（跟随系统 / 浅色 / 深色）与颜色（中性 / 柑橘 — 即 shadcn-nsh 随应用携带的主题；选一个即刻重绘所有面，不需重启）。全部立即生效，并保存在客户端偏好里；跟随系统时把 `zh*` 读作简体中文、其余读作 English，并跟随系统变化。
  - **后台**：Host 与 dsh web 的相位、Host 自身版本、dsh 实际版本与要求版本（不一致时两者并列并说明 Host 拒绝启动）、最近错误、启动 / 停止 / 重启 dsh，以及 Background Services 登记面板。
  - **设备**（`features/devices/`）：这台 Runner 上已配对的 Device。列表（名称、平台、在线、最后出现、配对时间）的唯一所有者是 `features/devices/state.ts`：先 `GET /bridge/devices`，再跟 `/watch` 里 `event` 为 `bridge.devices` 的帧。**添加设备**向 Host 要一条配对链接，画成二维码，并可复制、看倒计时；过期后提示重新生成，生成新的会作废还没使用的旧链接。链接只留在这一页：不进存储、不写日志。Relay 未配置时只说明原因，不发配对请求。撤销先在确认框里点名，再 `DELETE /bridge/devices/{deviceId}`，列表改成返回的那份。
  - **这台设备**（`features/settings/Device.tsx`，只在 Device 上）：它报告的平台与 **断开这台设备**——确认后清掉本机的配对记录、回到配对页；要真正收回访问，仍得在 Runner 上撤销这台 Device。
  - **关于**：dsh-bot / Host / dsh 版本与 **复制诊断信息**（只有版本与连接状态，没有 Key、令牌或会话内容）。
- **对话**：一个 Bot 的 Pane 就是它的那条长对话，按时间把段（Session）连成一条连续 transcript，用 shadcn-nsh 的 `message-scroller`（视口、内容、每行与回到最新的按钮）画出，里面是 `message`（一轮）、`bubble`（这一轮的外框）、`marker`（日期与段分隔线，以及一轮留下的说明）、`attachment`（消息带上的文件、输入框里的文件）与 `collapsible`（一次调用、一组步骤、一段思考折叠的内容）。读者在末尾时跟着最新一条走，一旦向上滚开就停下，最后一行上方随即出现回到最新的按钮；滚到顶部加载更早的页与段，读者原先看的那一行留在原处。段与段之间的分隔线写日期与工作目录（在主目录下显示为 `~/…`，完整路径留在 tooltip）；滚到顶部时，更早的段与段内更早的页都经官方 Session 模型加载。右侧历史轨每段一个刻度（当前段高亮）：悬停打开带背景的卡片，显示名称、时间与中间截断的目录，点击跳到该段开头；整条轨道是一个键盘停点，↑ / ↓ / Return 可用，并带 VoiceOver 标签。只有最新段接受输入，旧段可复制、可定位。命令面板的 **新话题** 或 `/new` 在当前目录开新段；在标题处改工作目录就在新目录开新段。接近上下文上限时 **Compact** 留在同一段内。没有段的 Bot 可以在默认工作目录开始第一段。
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

## Device 与 Runner

同一个 Client 有两种角色，只由一个判断决定：这台终端是不是 Runner。

- `hasHost`（`components/shell/host.ts`：桌面且非 web）说明这里跑着 Host，即 Runner：Connection 走回环 Host 的 `/connect`（见 [dsh-connection](../../docs/architecture/dsh-connection.md)）。
- 其余终端是 Device。还没有配对记录时，整个应用就是配对页（`features/pairing/`）：粘贴 Runner 在 设置 › 设备 里给出的链接，给这台 Device 起名（默认取平台名），然后连接。错误按 `RelayError.code` 选文案，从不显示原始 `message`；粘贴的链接只活在那一页的 signal 里，不落盘、不进日志——只有 `pairDevice` 写下的记录会留下。配对成功后 Carrier 交给 Shell，正常界面替换配对页。
- 握手的 `device-revoked` 或隧道里的 `revoked`：Carrier 清掉记录，应用回到配对页，并提示 Runner 已移除这台 Device。
- `components/shell/device.ts` 拥有本机的阶段、名称草稿与提示；配对记录本身仍只由 `lib/carrier/relay/pairing.ts` 读写 Storage（`dsh-bot.device.pairing`）。

## Carrier

`lib/dsh` 只通过 `installConnection` 的 Carrier seam（`streamBaseUrl`、`fetch`、`createWebSocket`）访问 dsh。`lib/carrier/relay/` 是 Relay Carrier 的 Device 一侧；wire 契约只在 [relay-tunnel](../../docs/architecture/relay-tunnel.md)。`lib/dsh/index.ts` 在 `package.json` 里导出为 `@dsh-bot/client/dsh`，端到端测试经它驱动真正的 Connection。

- `noise.ts`：Noise IK（日常）与 IKpsk1（配对）握手状态，发起方与响应方。
- `pairing.ts`：配对链接解析、Device 静态密钥、唯一一份配对记录，以及 `pairDevice` 的配对握手。
- `tunnel.ts`：一条 Relay WebSocket——模式字节、握手、`[流号][类型][正文]` 帧、保活与关闭码。
- `index.ts`：公开 Interface，在 `package.json` 里导出为 `@dsh-bot/client/relay`；端到端测试（[`tests/e2e`](../../tests/e2e/README.zh.md)）经它使用 Carrier。这个目录里的其他文件不被 Client 之外的代码导入。
- `carrier.ts`：跑在这条隧道上的 HTTP 与 WebSocket 流：`fetch`（响应体流式）与 EventTarget 形状的 socket。调用方取消的请求（signal 中止，或响应体被取消）会发 `RESET {"code":"cancelled"}` 并结束该流。隧道断开时进行中的流全部失败；重连归官方 connection。
- `bytes.ts` / `errors.ts`：共享编码与带 code 的错误。

## 数据

- Ticket 与 Attention：`tickets` 插件拥有它们；Client 经 `tickets` Remote 读一份快照（先 `snapshot`，再订阅 `watch`），也经它写回答与取消（[`features/tickets/state.ts`](features/tickets/state.ts)）。快照是 Device 上唯一的副本；Ticket 的 Session 不写进 Bot 注册表。
- 注册表：`bots` 插件拥有它，放在 `$DSH_BOT_HOME/bots/registry.json`。Client 经 `bots` Remote 读（先 `snapshot`，再订阅 `watch`）和写，不在 Device 上留副本。版本 6 存 templates 与 Bots；每个 Bot 用 `segments`（`sessionId` + `workspaceId` + 人对它的称呼）按时间从旧到新持有它的一条长对话。插件保证 Main Bot（`bots-main`）排在第一，并拒绝归档或删除它。Identity、归档位与段的认领在注册表（[0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md)）；Workspace 路径、名字、Session 顺序与归档归 dsh（[GLOSSARY](../../docs/GLOSSARY.md)）。Pin、Pane、主题和语言留在 Device 上。
- Workspace 与 Session：官方 `ClientWorkspaceModel` / `ClientSessions` 装在 Connection 的 Cordis Context 上（`lib/dsh/connection.ts`），每个 Host generation 原子替换它们的 snapshot。`features/workspace` 与 `features/dialogue/session` 只把 snapshot 投影成 NSH signal；Remote 的返回不写这份状态。它们的浏览器 `__ModuleLoader__` 产物由 `prepare:sdk` 展开成静态 ESM（`lib/dsh/generated/`），因为 NSH 不运行字符串代码。
- 客户端偏好：桌面 `~/.dsh-bot/prefs/client.json`；其他目标走 Storage（`dsh-bot.prefs.shell`）。版本 2 覆盖 Navigator 的宽度与开合、Pin 的 Bot 顺序、Pane（布局、每个 Pane 的 Bot、活动 Pane）与通用页的外观、语言和颜色（旧文件读默认值；本版本不带的主题 id 读作构建时主题）。版本 1 文件只读一次：Bot pin 保留，Dialogue / Session pin 变成它所属 Bot 的 Pane，Session pin 本身丢弃。聊天发送键是独立的 Storage 键（`dsh-bot.prefs.sendKey`）。
- `capabilities.network.hosts` 写 `["*"]`：Device 在配对时才知道 Relay 的 host，而 NSH 不能表达「任意 host、只走 https/wss」（`network.http` 只能按 host 收窄协议，`hosts` 的 `"*"` 又会连 http/ws 一起放行）。协议规则改由代码在隧道两端守住：https/wss，或只有 `localhost`、`127.0.0.1`、`::1` 上才允许 http/ws。127.0.0.1 的路径规则保留为回环清单；`"*"` 已经覆盖它们。
- `capabilities.fs` 只授 `${homeDir}/.dsh-bot` 读写。附件走系统选择器；授权外的拖放与粘贴退回同一个选择器 —— 见 [0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)。

## 语言

整套界面是简体中文或 English。所有用户可见文案——Navigator、Pane 标题与控件、transcript 与历史轨、Bot 详情、新建 Bot、⌘K、右键菜单、应用菜单与快捷键说明、通知、空状态、设置各组，以及 Client 自己的 Host / 启动器 / Background Services 消息——只有一个目录 [`lib/i18n/messages.ts`](lib/i18n/messages.ts)，键为类型：缺键或缺一种语言都会让 `nsh check` 失败。视图只经 `t(key, values)` 取文案，所以在设置 › 通用里切换语言会原地重绘，无需重启；选择与其他客户端偏好一起保存，**跟随系统**读取 NSH 的 `locale()`（`zh*` 为简体中文，其余为 English）并跟随变化。见 [ARCHITECTURE §5](../../docs/ARCHITECTURE.md)。

按设计不翻译：用户输入与 Bot 的名字（Bot 名、消息与模型回复、段标题）、产品与专名（dsh-bot、Host、dsh、Relay、DeepSeek、模型 id、Agent preset id、`/new`）、dsh 自己返回的文本（provider 名与 dsh 错误正文，放在已翻译的框里原样显示）、shell 命令、键盘键名与文件路径。语言选择器用各语言自己的写法（简体中文、English）。

## 已知限制

- 窄窗只显示移动提示页；桌面壳从 700 pt（desktop idiom）/ 900 pt（其他）起。
- 界面没有段级归档 / 删除；归档的是 Bot，段与日志都保留。
- dsh 的 Session 模型目录受凭据门控：没有可用 Key 时目录为空，默认模型卡片退回各供应商设置里公布的 `models` 与当前选择。见 [ARCHITECTURE §4](../../docs/ARCHITECTURE.md)。
- Host 未挂载 `dsh-bots` 时 Bot 详情存不了 Skills / Plugins 变更：没有别的 Remote 能写 Agent preset 正文。见 [ARCHITECTURE §4](../../docs/ARCHITECTURE.md) 的缺口表。
- 客户端阻塞时 dsh mux 可能因错过两次心跳断开；Session controller 会重跟（3 次、退避）。细节见 [dsh-connection](../../docs/architecture/dsh-connection.md)。

## 原生层：App 自己启动的 Host（仅本机桌面）

本应用没有 Rust（[0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)）。Host 是 `127.0.0.1:4872`（`DSH_BOT_HOST_PORT`）上的回环 HTTP + 一个 WebSocket，用 `<数据根>/host/serve-token` 认证。OS 登记是 Host 自己的快照（`version`、`phase`、可选 `reason`）；公网 Relay 不是本机控制面，也不向系统登记。

- `lib/host/launcher.ts`：没有 Host 就起（`dsh-bot-host serve-app`），有就复用，退出后 1 秒起、翻倍到 15 秒重启；要求 `dsh-bot-host` 在 `PATH` 上（`cargo build -p dsh-bot-host` 产出在 `target/debug`，`scripts/run-with-host-path.mjs` 为桌面端的 `dev*` 脚本（`dev`、`dev:macos`、`dev:windows`、`dev:linux`、`dev:gpui`）把它放前面）。日常用根目录 `bun run dev [target]`，它在 Host 源码变新时重建二进制，并且只给桌面目标接上这个 `PATH`。
- `lib/host/client.ts` 是传输（`fetch` + 标准 `WebSocket`）；`lib/host/control.ts` 是产品面（`ensureBackendReady`、`resolveDshLoginUrl`、`watchHostStatus`，以及 `bridgeAccess` 的 `GET /bridge/devices`、`POST /bridge/pairing`、`DELETE /bridge/devices/{deviceId}`）。`/watch` 同一条 socket 上既有公开状态帧，也有 `bridge.devices`；未知 `event` 只记日志并忽略，不当成 Host 断开。Host 的公开状态还带 `hostVersion` 与 guardian 实际找到的 `dshVersion`，供后台与关于页显示。
- 启动器起不来时，侧栏页脚就是 Host 空状态：原因 + 手动的 `dsh-bot-host serve-app`。
- `dev:ios` / `dev:android` / `dev:mobile` / `dev:web` / `dev:server` / `package:*` 不起 Host——其他 Device 经公网 Relay 访问 Runner，不走本机 Host。

## 相关

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) —— 客户端结构与 dsh 缺口表。
- [dsh-connection](../../docs/architecture/dsh-connection.md) —— 回环 Cookie 引导与 mux 心跳限制。
- [0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md) / [0007](../../docs/decisions/0007-the-client-is-pure-tsx.md) —— identity 归注册表；`fs` 只授应用数据。
- [screens/README.md](screens/README.md) —— 截图与 opt-in 真 Host 冒烟。
