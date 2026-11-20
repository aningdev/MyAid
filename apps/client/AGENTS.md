# NSH 客户端约束

补充[根约束](../../AGENTS.md)。职责与结构以[架构 §5](../../docs/ARCHITECTURE.md)为准，单元契约见 [README](README.md)。

## 读什么

- **设计**（组件、布局、视觉、交互、文案）：先 [Design Guides](../../references/nsh/website/docs/design-guides.md)。
- **编码**（状态、响应式、组件边界、焦点、列表、异步）：[Coding Guides](../../references/nsh/website/docs/coding-guides.md)。
- **组件与样式**：`references/nsh/examples/nsh-gallery-ui`、`references/nsh/examples/gallery`、`references/nsh/website`。
- **类型与运行时**：安装版 `.nsh/types/`；生产代码只用安装版 NSH 模块。
- **dsh 能力面**：先对照官方 `dsh web` 与只读 `references/deepseek-harness` 的 Remote；NSH 侧只建产品 UI，不移植其 Web GUI / 审批页 / 品牌文案。

## 布局（NSH TSX）

- 本目录是纯 TSX 应用：`App.tsx` 入口，`nsh.json` 无 `"rust"` 键，没有 `Cargo.toml` / `src/`（[0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)）。原生层是 `lib/host` 里的回环 HTTP / WebSocket 客户端与启动器。
- `components/` 是壳与样式：壳在 `components/shell/`（UI 与状态同目录），组件层 `components/ui/`（只放 shadcn-nsh 复制件）与 `components/app/`（产品组合）；`features/` 放产品域，由 Pane 按 Bot id 挂；`lib/` 放协议、宿主与产品后台适配。
- 不另起平行 `frontend/{ui,application,infrastructure}` 树。新增文件先落现有目录；线框不混入产品路径。

## TSX 与运行时

- 用 NSH 细粒度响应式；不套 React hooks，不引入 `solid-js`。
- 订阅与原生句柄在 `cleanup` 中释放；组件卸载 ≠ 后台任务停止（运行中的 Session 在 Pane 关掉后继续）。
- 每个状态 / 策略只有一个所有者：Registry 的读写只经 `features/bots/state.ts` 调 `bots` Remote（插件是 Registry 的所有者，Client 不落盘），`SessionController`、壳的 Pane 状态不各自复制一份。派生值用 `computed`（列表行见 `components/shell/botList.ts`），别在视图里重算第二套模型。Navigator 的顺序只在 `botList.ts` 计算：先是 Pin 区（按 Owner 的 Pin 顺序），其后 Main Bot 排第一，其余 Bot 按最近活动排序（[GLOSSARY](../../docs/GLOSSARY.md)）。
- 一个 Bot 只在一个 Pane 里：打开走 `state.openBot`（已有 Pane 只切焦点），拖入走 `state.dropBot`；不要在视图里再拼一套去重。

## UI 边界

- **UI 文案只有 `lib/i18n/messages.ts`**：组件不持有字面界面文案，一律经 `lib/i18n` 的 `t(key, values)`；新增文案先加 zh + en 两栏（键为类型，缺键 `nsh check` 失败）。语言偏好（跟随系统 / 简体中文 / English）与 `locale()` 的读取同在 `lib/i18n`，`跟随系统` 把 `zh*` 读作简体中文、其余读作 English。用户内容、产品与专名、dsh 自己返回的正文与文件路径不进目录、不翻译（细则见 [ARCHITECTURE §5](../../docs/ARCHITECTURE.md)）。
- **组件来自 [shadcn-nsh](https://github.com/aningdev/shadcn-nsh)**（`shadcn-nsh` 是 devDependency，复制源与版本一起 pin 在 `nsh-ui.json` 的 `registry` tag）：`components/ui` 只放经它的 CLI `add` 复制进来的文件，主题、外观、状态都归它。选型顺序：shadcn-nsh 组件 → 用 shadcn-nsh 组件拼的产品组合（`components/app/`）→ 已核实缺口的最小自定义；功能模块不直连 `nsh/base` 的有样式控件。
- **复制件的出入只走 CLI**：`bun run ui:diff`（在 `check` 里）核对 `components/ui` 与 `nsh-ui.json` 那个 tag 的注册表是否一致（不一致就 `add --overwrite` 拉回，不在本仓打补丁）；`vp fmt` 不碰这些复制件与 `theme.json`（见 `vite.config.ts` 的 fmt ignore）。图标一律 `import { X } from "lucide"`，经 `lib/icons` 的 `Icon` 画。
- **只调间距与布局**：复制进来的文件不改；dsh-bot 只在调用处用 `class` / `style` 定间距、尺寸与排布，不写颜色字面量、不覆盖组件外观。组件缺功能或有缺陷，到 shadcn-nsh 提 [issue](https://github.com/aningdev/shadcn-nsh/issues)，修好后 `add --overwrite` 拉回，不在本仓打补丁。
- **缺口先分归属**（shadcn-nsh 对标 shadcn）：① shadcn 有而副本不一致 / 有缺陷，或属 NSH 平台差异（原生无障碍、无 `asChild`、CLI）→ 提给 shadcn-nsh；② shadcn 用别的写法满足同一需求 → 改 dsh-bot 的设计去用它（如外框里的输入用 InputGroup、开关行用 Switch），不请组件库迁就；③ 只有本产品需要 → 在 `components/app/` 用 shadcn-nsh 组件拼，拼不出再按上条做最小自定义（如图片灯箱）。
- **对话那一屏归 shadcn-nsh 的会话组件**：transcript 的视口、跟随末尾、回到最新与每行是 `message-scroller`，一轮是 `message` + `bubble`，分隔线与说明是 `marker`，文件是 `attachment`，折叠是 `collapsible`。不要退回自造的 `List` + 手动跟随 + 自绘圆钮；这一屏的滚动状态由 `features/dialogue/chat/Transcript.tsx` 持有并回给 Pane，测试读它自己的 `id:transcript-edge`（库的画钮靠动画值，测试读不到）。
- **主题与配色只经 shadcn-nsh 主题**：浅色 / 深色 / 跟随系统是客户端偏好；颜色方案选的是 shadcn-nsh 发布的主题，本仓不另造调色板或强调色覆盖。
- 布局原语与运行时（`View` / `Text` / `signal` / `mount` / `token`…）从 `nsh` 引入。

## dsh 传输与产品层级

- 认证 WS 用标准 `websocket`：`connect(url, { headers: { Cookie } })`；`AuthenticatedSocket` 只包装成官方 dsh 要的 EventTarget。`nsh.json` 的 `capabilities.network.http` 只放行回环 dsh 端点；未授权 URL 由 NSH 以 `ERR_ACCESS_DENIED` 拒绝。
- wire 类型从 [`@dsh-bot/dsh-web-protocol`](../../packages/dsh-web-protocol) 引用，版本与 [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 对齐；不从 `references/` 拷贝类型。产品视图 DTO 与官方同名类型分开命名。
- Remote 优先复用官方已挂载面；新增命名空间先 `$mount` 其 `/remote`。不调用 `account.*`。
- **段的落点是 dsh Workspace**（[GLOSSARY](../../docs/GLOSSARY.md)；产品形态见 [GLOSSARY](../../docs/GLOSSARY.md)）：`workspace.create` / `rename` / `insertSessionBefore` 等是 Workspace 字段的**唯一写入口**；`session.create({ workspaceId })` 负责 create-then-attach。插件的 Registry 只存段的 `workspaceId`，Client 不在本地重建 path / title / 顺序。
- **官方 client model 是 Session / Workspace 状态的唯一所有者**：`lib/dsh/connection.ts` 在装好 Remote 的同一条 Cordis Context 上 `plugin` 官方 `ClientSessions`（`ctx.sessions`：列表、事件窗口、follow、分页、prompt/queue/control、投影）与 `ClientWorkspaceModel`（`ctx.workspaces`：行、顺序、归档、置顶）。产品只投影它们发布的 snapshot（[`features/dialogue/session`](features/dialogue/session/controller.ts)、[`features/workspace/state.ts`](features/workspace/state.ts)），不另建 follow / 重连 / 分页 / 回执映射，也不在视图里重算一遍。官方未提供的命令（模型目录与选择、skills、`/command`、插件清单、bot preset、上传、目录选择）留在 `Connection`。
- 产品形态是**一个 Bot 一条长对话**，由按时间相连的段（Session）组成（[GLOSSARY](../../docs/GLOSSARY.md)）。插件的 Registry v6 让 Bot 直接持有 `segments`（段 = 认领），段可跨 Workspace。Client 只持有当前快照。只有最新段接受输入，旧段由 ChatPane 经官方 Session 模型向上加载（`features/bots/sessions.ts`、`features/dialogue/ChatPane.tsx`），别在视图里另挑一条或在本地再存一份。
- `@deepseek-ai/dsh-*` 的 `/client` 在默认 `browser` 条件下无 ESM `installConnection`；用 `bun run prepare:sdk` 打出的 `lib/dsh/sdk.js`（`nsh.json` 的 `resolve.conditions: ["node"]` 兜底）。勿手改该产物。
- 官方 client model（session / workspace / file-upload 的 `lib/client.js`）是浏览器 `window.__ModuleLoader__.load({id, factory})` 产物，NSH 发行版禁用 `Function` 构造器（不跑字符串代码），因此 `prepare:sdk` 把 factory 主体原样包成静态 ESM，落在 `lib/dsh/generated/`（gitignore）。升 `@deepseek-ai/dsh-*` 后重跑 `prepare:sdk`；它按包版本重写文件，找不到 loader 外壳会直接报错。
- 认证与心跳细节的唯一下沉文档：[dsh-connection](../../docs/architecture/dsh-connection.md)。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。`fs.read: ["/"]` 在 Windows 无效；产品数据用 `${homeDir}/.dsh-bot`。
- **声明了 capabilities 就逐项授权**：nsh 0.6 起，声明 capabilities 的应用必须显式列出 `application`（菜单、`Application`、主窗口）、`homeDir`（`os.homedir()`）与 `statusBar`（灯箱的状态栏样式）；漏掉不报错，运行时静默变成拒绝或告警。`nsh test` 会把未授权的这类用法打成 `warn`，按它补齐。
- **`fs` 只授应用自己的数据**：`read` / `write` 都是 `${homeDir}/.dsh-bot`。nsh 0.6 仍没有「用户选中才可读」的授权，别为附件放宽回 `${homeDir}`。
- **附件只走系统选择器**：回形针直接拿字节；拖放 / 粘贴只给 `file:` URL，授权外或读不了时由 [`chat/attach.ts`](features/dialogue/chat/attach.ts) 开同一文件的 `Picker`。策略只此一处。
- 本机控制端点（Unix socket / named pipe）、`SMAppService` 仅在标准 API 缺口核实后添加；升级后复核可否迁回。
- 改控制面后跑 `nsh check`；`lib/host/control.ts` 只给宿主管理与登记事实，不当业务网关。启动 Host 的唯一入口是 `lib/host/launcher.ts`，别处不 spawn。
- Settings ⇢ Background 是 [0006](../../docs/decisions/0006-host-is-the-only-background-service.md) 的客户端侧：只编排 Host 的 query / enable / stop，不代 Host 做登记决定；事实经 Host 的回环 HTTP 控制面取（[0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)）。

## Ticket 与 Attention

- **Ticket 与 Attention 的快照只有一个所有者**：`features/tickets/state.ts`（Remote `tickets`：`snapshot` + `watch`，写经 `answer` / `cancel`），epoch 与 revision 防旧快照覆盖新快照；视图只读它的选择器，不另存一份。Ticket 的 Session 是那件工作自己的过程，**不是** Bot 的段：不写 Registry、不当作 Segment 挂进 Pane 的对话。
- **Attention 不在 Dialogue 里**：Navigator 的 **Needs you** 行与 `TicketBoard` 的信息流层是它的入口，按 Ticket 归属排列；问题与审批的作答都经 `tickets/answer`，回答后由 `watch` 从所有 Device 消失。第一版不推送，只在 Client 打开时提醒；不要与 `components/shell/attention.ts` 的系统通知混成一套。
- **取消是可撤销不了的写**：`tickets/cancel` 只对进行中的 Ticket 显示，先经 `AlertDialog` 确认（对象与后果写清楚），再写入；不用乐观更新。
- Pane 里的 Ticket 列表是 `features/tickets/BotTickets.tsx`（Pane 顶部），整页信息流是 `features/tickets/TicketBoard.tsx`（Workbench 覆盖层，`features/tickets/board.ts` 持有开合）。

## Bot 详情与设置

- **Bot 详情**是一个弹窗（`features/bots/BotDetails.tsx`），由 Pane 标题的 `Bot details:` 按钮、行的右键菜单与命令面板打开；打开状态只在 `features/bots/details.ts`。里面对段的事实（路径、模型、用量、Compact）来自 `features/bots/sessionFacts.ts`，不在注册表另存。
- **设置**是盖在 Pane 之上的整页覆盖层（`components/shell/SettingsOverlay.tsx`），不是 Navigator 分区或 Pane；Esc / Back 关掉它，Pane 状态不动。左栏四组：供应商（dsh 目录 + `settings` / `credentials` Remote）/ 通用（客户端外观与语言偏好）/ 后台（Host 事实 + Background Services 面板，后者内部归 N1）/ 关于。供应商字段与默认模型只经 dsh Remote 读写，Key 不进客户端文件。

## 验证

- 应用生命周期走官方 `nsh check` / `nsh test`；工作区编排用 `vp run @dsh-bot/client#…`。命令清单在 README。
- 组件层改动：`nsh check` → 相关 `nsh test <file>` → 收尾跑 `nsh test --target macos`（截图落在 `.handoff/shots`，不进 `/tmp`）→ `bun run ui:diff` 必须是 `No differences.`。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
- 真 Host 冒烟是 opt-in（`DSH_BOT_SMOKE_HOST`）；默认 `nsh test` 不得需要活 Host。测试应用（`test/open.ts` 的标记）**不得**探本机控制面端口、不得 spawn `dsh-bot-host`：判据在 `lib/data-root.ts` 的 `hostControlAllowed`，护栏测试 `test/host-control.test.tsx`。
- 测试隔离：所有打开 app 的测试经 [`test/open`](test/open.ts)（`nsh test` 的 host 参数 `dshBotTest`），prefs 落到该 app 的 Storage，绝不用真实 `~/.dsh-bot`；`test/data-root.test.tsx` 是这条 seam 的 guard。没有 Host 的 app 把 Registry 夹具放在同一份 Storage（`dsh-bot.test.bots`），由内存 `bots` Remote 读出，这不是产品缓存。没有 Host 的 app 测试用 [`test/workspaces`](test/workspaces.ts) 预置 Workspace baseline（与 dsh 发出的帧同形），生产路径只读 `workspace.follow`。
- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。

## 文档

改行为先改真源（[ARCHITECTURE](../../docs/ARCHITECTURE.md) / [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md) / ADR），再改 README 与本文的指针。本文只留护栏与去向，不写教程、清单复述或历史。
