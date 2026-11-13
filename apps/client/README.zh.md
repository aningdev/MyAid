# @myaid/client

[English](README.md) | 中文

NSH **mixed** 桌面 / 移动客户端：TSX 入口（`App.tsx`）加上本目录 Rust crate（`Cargo.toml`、`src/lib.rs`；`nsh.json` `"rust": "."`）。拥有 Workspace Shell、Bot 注册表与官方 dsh 协议客户端。架构与 DSH 边界：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。编码护栏：[AGENTS.md](AGENTS.md)。

Bundle id：`com.aningdev.myaid`（见 `nsh.json`）。布局对齐 `nsh init --template mixed`（[project structure](https://nsh.dev/docs/project-structure.md)）。

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── shell/                  # Navigator、Workbench、Panels、命令表、偏好、注意
│   └── ui/                     # 样式化基础层（唯一包装 nsh/base）
├── features/                   # bots、dialogue、inspector、settings
├── lib/                        # dsh、host、relay、background
├── screens/                    # open(…) 入口、截图、真 Host 冒烟（opt-in）
├── nsh.json                    # "rust": "."
├── Cargo.toml / src/           # myaid/native — HostControl / RelayControl
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
- 真 Host 冒烟是 opt-in：未设置 `MYAID_SMOKE_HOST_SOCKET` 时 `screens/*.smoke.test.tsx` 直接返回。见 [screens/README.md](screens/README.md)。

## 壳

- **Navigator**：左侧可收缩 `ResizablePanel`（默认 232，最小 160，最大 480）。顶行承接隐藏标题栏的拖拽；下面是过滤字段（`⌘F`）与 `nsh/base` Tree。depth 0 是分区（Favorites、Mail、Task、Knowledge、Bots、Dialogues、Spaces、Settings）；按叶子把 Nav address 开到活动 Panel，右键给该对象的动词。Bots / Dialogues 来自注册表，Favorites 是置顶地址，Settings 的叶子打开 Background Services；Mail / Task / Knowledge / Spaces 仍是停放 fixtures。
- **Workbench**：`nsh/base` DockArea（center），Panel 可拆、缩放、放大、移动、关闭。layout、每个 Panel 的 Nav address、活动 Panel、Navigator 宽度与折叠分区从客户端偏好恢复；对象不在时地址解析为空 Panel。
- **Panel 内容**：`session` → `SessionPanel` → `ChatPane`（标题、transcript、审批、composer）+ 可选 **Inspector**；`dialogue` → `DialoguePanel`；`bot` → `BotPanel`；`setting` → Background Services。空 Panel 在还没有 Bot 时显示欢迎页。
- **运行态归属**：`SessionController` 持有一条 Session 的 follow 流、草稿、附件与审批队列。同一 Session 的两个 Panel 共用；两条 Session 可并行流式。Navigator 行显示执行中 / 未读 / 待审批状态点。
- **New Bot**：一张 sheet（`features/bots/NewBotSheet.tsx`），Bots 分区 `+`、`⇧⌘N`、欢迎页与命令面板都开它。Host 在时创建 Bot + Dialogue + 首个 Session。
- **Inspector**：Session Panel 右侧窄栏（268–320），按 Panel 用 `⌥⌘I` 开关。Bot / Dialogue / Sessions / Deliverables / Usage；Compact 执行 `/compact`；Host 允许时工作区路径在 Finder 中显示。
- **Bot Settings**：一张 sheet，四段 Profile / Runs with / Skills / Plugins。Profile 与 Runs with 写注册表偏好；Skills 与 Plugins 读该 Bot 的 preset 组成。能力变更在 preset writer 可用时派生 Bot 自己的 preset，否则如实说明写不了。

| 快捷键       | 动作                             |
| ------------ | -------------------------------- |
| `⌘N`         | New Session                      |
| `⇧⌘N`        | New Bot                          |
| `⌘K`         | 命令面板                         |
| `⌘F`         | 过滤 Navigator                   |
| `⌘B`         | 收起 / 展开 Navigator            |
| `⌥⌘I`        | 开关 Inspector                   |
| `⌘\` / `⌘⇧\` | 向右 / 向下拆分活动 Panel        |
| `⌘[` / `⌘]`  | 上一个 / 下一个 Panel            |
| `⌘W`         | 关闭 Panel                       |
| `⌘.`         | 停止执行中的一轮                 |
| `⌘L`         | 聚焦 composer                    |
| `⌘1…⌘8`      | 展开并定位第 N 个 Navigator 分区 |

`components/shell/commands.ts` 是键盘、应用菜单与命令面板共用的唯一命令表。`components/shell/attention.ts` 把不在前台 Session 的回复结束或新审批变成系统通知与 Dock badge。

## 数据

- 注册表：桌面 `~/.myaid/registry/bots.json`；web / 移动走 `nsh` Storage（`myaid.registry.bots`）。版本 4 存 templates、Bots 与 Dialogues；v3 文件读取时迁移，v2 及更早拒绝。Identity、Dialogue 名与归档都在注册表，不在 dsh preset 正文 —— 见 [ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md)。
- 客户端偏好：桌面 `~/.myaid/prefs/client.json`；其他目标走 Storage（`myaid.prefs.shell`）。覆盖 Navigator、Workbench 与 Favorites。聊天发送键是独立的 Storage 键（`myaid.prefs.sendKey`）。
- `capabilities.fs` 只授 `${homeDir}/.myaid` 读写。附件走系统选择器；授权外的拖放与粘贴退回同一个选择器 —— 见 [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md)。

## 已知限制

- 窄窗只显示移动提示页；桌面壳从 700 pt（desktop idiom）/ 900 pt（其他）起。
- Bot Settings 保存不了 Skills / Plugins 变更：没有写 Agent preset 正文的 Remote。见 [ARCHITECTURE §4](../../docs/ARCHITECTURE.md) 的缺口表。
- 客户端阻塞时 dsh mux 可能因错过两次心跳断开；Session controller 会重跟（3 次、退避）。细节见 [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md)。

## Host socket（仅本机桌面）

日常联调请从**仓库根** `bun run dev`：先确保 Host，再起本包 `dev`。  
`MYAID_HOST_SOCKET` 由根 `scripts/dev.mjs` 与本包 `dev` / `dev:macos`（经 `scripts/run-with-host-socket.mjs`）注入；Unix 默认 `~/.myaid/host/control.sock`，Windows 默认 `\\.\pipe\myaid-host`，可覆盖。  
`dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` **不注入**——移动端经 Relay，不走本机 Host 控制通道。

## 相关

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) —— 客户端结构与 dsh 缺口表。
- [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md) —— 回环 Cookie 引导与 mux 心跳限制。
- [ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md) / [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md) —— identity 归注册表；`fs` 只授应用数据。
- [screens/README.md](screens/README.md) —— 截图与 opt-in 真 Host 冒烟。
