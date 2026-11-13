# NSH 客户端约束

补充[根约束](../../AGENTS.md)。职责与结构以[架构 §5](../../docs/ARCHITECTURE.md)为准，单元契约见 [README](README.md)。

## 读什么

- **设计**（组件、布局、视觉、交互、文案）：先 [Design Guides](../../references/nsh/website/docs/design-guides.md)。
- **编码**（状态、响应式、组件边界、焦点、列表、异步）：[Coding Guides](../../references/nsh/website/docs/coding-guides.md)。
- **组件与样式**：`references/nsh/examples/nsh-gallery-ui`、`references/nsh/examples/gallery`、`references/nsh/website`。
- **类型与运行时**：安装版 `.nsh/types/`；生产代码只用安装版 NSH 模块。
- **dsh 能力面**：先对照官方 `dsh web` 与只读 `references/deepseek-harness` 的 Remote；NSH 侧只建产品 UI，不移植其 Web GUI / 审批页 / 品牌文案。

## 布局（NSH TSX）

- 本目录是纯 TSX 应用：`App.tsx` 入口，`nsh.json` 无 `"rust"` 键，没有 `Cargo.toml` / `src/`（[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)）。原生层是 `lib/host` / `lib/relay` 里的回环 HTTP / WebSocket 客户端与启动器。
- `components/` 是壳与样式：壳在 `components/shell/`（UI 与状态同目录），样式层在 `components/ui/`；`features/` 放产品域，由 Pane 按 Bot id 挂；`lib/` 放协议、宿主与产品后台适配。
- 不另起平行 `frontend/{ui,application,infrastructure}` 树。新增文件先落现有目录；线框不混入产品路径。

## TSX 与运行时

- 用 NSH 细粒度响应式；不套 React hooks，不引入 `solid-js`。
- 订阅与原生句柄在 `cleanup` 中释放；组件卸载 ≠ 后台任务停止（运行中的 Session 在 Pane 关掉后继续）。
- 每个状态 / 策略只有一个所有者：注册表写入口、`SessionController`、壳的 Pane 状态不各自复制一份。派生值用 `computed`（列表行见 `components/shell/botList.ts`），别在视图里重算第二套模型。
- 一个 Bot 只在一个 Pane 里：打开走 `state.openBot`（已有 Pane 只切焦点），拖入走 `state.dropBot`；不要在视图里再拼一套去重。

## UI 边界

- 选型顺序：NSH 原语 / `nsh/base` → gallery / `nsh-gallery-ui` 模式 → 产品组合进 [`components/ui`](components/ui/) → 已核实缺口的最小自定义。
- `components/ui` 是本仓样式化基础层（对齐 gallery 外观 / motion），主题为官方 shadcn `neutral`。共享视觉规则先在此层演进。
- 功能模块默认经 `components/ui` 组合；直连 `nsh/base` 仅限模块自管导航与尚未封装的 gallery 控件。
- 布局原语与运行时（`View` / `Text` / `signal` / `mount` / `token`…）从 `nsh` 引入。

## dsh 传输与产品层级

- 认证 WS 用标准 `websocket`：`connect(url, { headers: { Cookie } })`；`AuthenticatedSocket` 只包装成官方 dsh 要的 EventTarget。`nsh.json` 的 `capabilities.network.http` 只放行回环 dsh 端点；未授权 URL 由 NSH 以 `ERR_ACCESS_DENIED` 拒绝。
- wire 类型从 [`@myaid/dsh-web-protocol`](../../packages/dsh-web-protocol) 引用，版本与 [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 对齐；不从 `references/` 拷贝类型。产品视图 DTO 与官方同名类型分开命名。
- Remote 优先复用官方已挂载面；新增命名空间先 `$mount` 其 `/remote`。不调用 `account.*`。
- **段的落点是 dsh Workspace**（[ADR 0005](../../docs/adr/0005-dialogue-on-dsh-workspace.md)；产品形态见 [ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md)）：`workspace.create` / `rename` / `insertSessionBefore` 等是 Workspace 字段的**唯一写入口**；`session.create({ workspaceId })` 负责 create-then-attach。注册表只存段的 `workspaceId`，不要在注册表里重建 path / title / 顺序。
- **官方 client model 是 Session / Workspace 状态的唯一所有者**：`lib/dsh/connection.ts` 在装好 Remote 的同一条 Cordis Context 上 `plugin` 官方 `ClientSessions`（`ctx.sessions`：列表、事件窗口、follow、分页、prompt/queue/control、投影）与 `ClientWorkspaceModel`（`ctx.workspaces`：行、顺序、归档、置顶）。产品只投影它们发布的 snapshot（[`features/dialogue/session`](features/dialogue/session/controller.ts)、[`features/workspace/state.ts`](features/workspace/state.ts)），不另建 follow / 重连 / 分页 / 回执映射，也不在视图里重算一遍。官方未提供的命令（模型目录与选择、skills、`/command`、插件清单、bot preset、上传、目录选择）留在 `Connection`。
- 产品形态是**一个 Bot 一条长对话**，由按时间相连的段（Session）组成（[ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md)）。注册表 v6 让 Bot 直接持有 `segments`（段 = 认领），段可跨 Workspace；只有最新段接受输入，旧段由 ChatPane 经官方 Session 模型向上加载（`features/bots/sessions.ts`、`features/dialogue/ChatPane.tsx`），别在视图里另挑一条或在注册表里造第二套分页。
- `@deepseek-ai/dsh-*` 的 `/client` 在默认 `browser` 条件下无 ESM `installConnection`；用 `bun run prepare:sdk` 打出的 `lib/dsh/sdk.js`（`nsh.json` 的 `resolve.conditions: ["node"]` 兜底）。勿手改该产物。
- 官方 client model（session / workspace / file-upload 的 `lib/client.js`）是浏览器 `window.__ModuleLoader__.load({id, factory})` 产物，NSH 发行版禁用 `Function` 构造器（不跑字符串代码），因此 `prepare:sdk` 把 factory 主体原样包成静态 ESM，落在 `lib/dsh/generated/`（gitignore）。升 `@deepseek-ai/dsh-*` 后重跑 `prepare:sdk`；它按包版本重写文件，找不到 loader 外壳会直接报错。
- 认证与心跳细节的唯一下沉文档：[docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。`fs.read: ["/"]` 在 Windows 无效；产品数据用 `${homeDir}/.myaid`。
- **`fs` 只授应用自己的数据**：`read` / `write` 都是 `${homeDir}/.myaid`。nsh 0.5 没有「用户选中才可读」的授权，别为附件放宽回 `${homeDir}`。
- **附件只走系统选择器**：回形针直接拿字节；拖放 / 粘贴只给 `file:` URL，授权外或读不了时由 [`chat/attach.ts`](features/dialogue/chat/attach.ts) 开同一文件的 `Picker`。策略只此一处。
- 本机控制端点（Unix socket / named pipe）、`SMAppService` 仅在标准 API 缺口核实后添加；升级后复核可否迁回。
- 改控制面后跑 `nsh check`；`lib/host/control.ts` 只给宿主管理与登记事实，不当业务网关。启动 Host 的唯一入口是 `lib/host/launcher.ts`，别处不 spawn。
- Settings ⇢ Background Services 是 [ADR 0002](../../docs/adr/0002-dual-background-services.md) 的客户端侧：只编排 query / enable / stop，不代 Host / Relay 做决定；事实经两个单元自己的回环 HTTP 控制面取（[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)）。

## Bot 详情与设置

- **Bot 详情**是一个弹窗（`features/bots/BotDetails.tsx`），由 Pane 标题的 `Bot details:` 按钮、行的右键菜单与命令面板打开；打开状态只在 `features/bots/details.ts`。里面对段的事实（路径、模型、用量、Compact）来自 `features/bots/sessionFacts.ts`，不在注册表另存。
- **设置**是盖在 Pane 之上的整页覆盖层（`components/shell/SettingsOverlay.tsx`），不是 Navigator 分区或 Pane；Esc / Back 关掉它，Pane 状态不动。左栏四组：供应商（dsh 目录 + `settings` / `credentials` Remote）/ 通用（客户端外观与语言偏好）/ 后台（Host 事实 + Background Services 面板，后者内部归 N1）/ 关于。供应商字段与默认模型只经 dsh Remote 读写，Key 不进客户端文件。

## 验证

- 应用生命周期走官方 `nsh check` / `nsh test`；工作区编排用 `vp run @myaid/client#…`。命令清单在 README。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
- 真 Host 冒烟是 opt-in（`MYAID_SMOKE_HOST`）；默认 `nsh test` 不得需要活 Host。测试应用（`test/open.ts` 的标记）**不得**探本机控制面端口、不得 spawn `myaid-host`：判据在 `lib/data-root.ts` 的 `hostControlAllowed`，护栏测试 `test/host-control.test.tsx`。
- 测试隔离：所有打开 app 的测试经 [`test/open`](test/open.ts)（`nsh test` 的 host 参数 `myaidTest`），注册表与 prefs 落到该 app 的 Storage，绝不用真实 `~/.myaid`；`test/data-root.test.tsx` 是这条 seam 的 guard。没有 Host 的 app 测试用 [`test/workspaces`](test/workspaces.ts) 预置 Workspace baseline（与 dsh 发出的帧同形），生产路径只读 `workspace.follow`。
- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。

## 文档

改行为先改真源（[ARCHITECTURE](../../docs/ARCHITECTURE.md) / [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) / ADR），再改 README 与本文的指针。本文只留护栏与去向，不写教程、清单复述或历史。
