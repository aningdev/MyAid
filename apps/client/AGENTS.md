# NSH 客户端约束

补充[根约束](../../AGENTS.md)。职责以[架构](../../docs/ARCHITECTURE.md)与 [DSH 原则](../../docs/DSH_PRINCIPLES.md)为准。

## 参考源（实现前）

- **设计**（选组件、布局、视觉、交互、文案前）：[Design Guides](../../references/nsh/website/docs/design-guides.md)。
- **编码**（状态、响应式、组件边界、焦点、列表、异步前）：[Coding Guides](../../references/nsh/website/docs/coding-guides.md)。先读 Design Guides。本仓目录以本文「布局（NSH mixed）」为准。
- **组件与样式**：`references/nsh/examples/nsh-gallery-ui`（样式化基础层）、`references/nsh/examples/gallery`（用法 / 交互 demo）、`references/nsh/website`（elements / modules 文档与 demos）。
- **类型与运行时**：安装版 `.nsh/types/`；生产代码只用安装版 NSH 模块。
- **dsh 能力面**（非 UI）：需要对话 / Session / 工具 / 审批等行为时，先对照官方 `dsh web` 与只读 `references/deepseek-harness` 的能力与 Remote；NSH 侧自建产品 UI，不移植 harness Web GUI。

## 布局（NSH mixed）

- 本目录是官方 **mixed** 应用：`App.tsx` 为 TSX 入口，`nsh.json` `"rust": "."`，Rust 在同级 `Cargo.toml` / `src/lib.rs`（`#[native_module("myaid/native")]`）。
- 产品 TSX 放 `components/`（壳在 `components/shell/`，样式层在 `components/ui/`）；功能域放 `features/`（由 Panel 按地址挂）；静态资源放 `assets/`。
- 保持 NSH mixed 目录，不另起平行 `frontend/{ui,application,infrastructure}` 树，除非架构文档明确改判。

## 工作台（Workspace Shell）

- 壳入口 [`AppShell.tsx`](components/AppShell.tsx) → [`shell/`](components/shell/)：UI 与状态同目录；**左侧可收缩 Navigator + 右侧 Workbench**；Panel 按 Nav address 挂 `features/*` 的 Bot / Dialogue / Session 内容，其余分区仍是占位。
- **Navigator**：水平 `ResizablePanel`（默认 232、最小 160、最大 480）。顶行 44pt 承接隐藏标题栏（可拖拽；左侧让出 `titleBar().left` 后是收起 / 展开图标按钮），下面是 **过滤字段**（`⌘F`）与 `nsh/base` **Tree**。depth 0 画成 Rex 式 **Navigator Section** 标题（可折叠、hover 显 chevron 与操作），分区内容整体左移一级；仍是一棵树、一个滚动与焦点。单击叶子即把 Nav address 打开到活动 Panel（Bot / Dialogue 行带地址，可打开且仍折叠；分区标题只折叠不打开），活动 Panel 换地址时选中同步回树。右键一行开该对象的 `ContextMenu`（不选中、不打开行）：Bot = Bot Settings… / New Dialogue… / Delete；Dialogue = New Session / Rename… / Archive；Session = Rename… / Add to Favorites / Archive。收起后左栏离开横排，右侧顶部只留 44pt 拖拽条和 Expand。`⌘1…⌘8` 展开并定位分区；其余快捷键见「命令、菜单与通知」。
- **树从注册表来**：[`navData.ts`](components/shell/navData.ts) 的 `projectNav({ registry, rows, favorites, query })` 是纯函数（单测在旁），响应式投影成 `TreeItem[]` + 地址表；`Navigator` 只负责画。Bots 分区 = Bot → 未归档 Dialogue → 未归档 Session；Dialogues 分区 = 全部未归档 Dialogue（标签 `Bot · 名称/工作区段名`）→ Session。Nav address 的 id 用领域 id（`bot:` / `dialogue:` / `session:`），同一 Dialogue 在两个分区指向同一 Panel。空 Bots 分区留一个 `New Bot` 叶子（开 New Bot 表）；Bots 分区标题的 `+`、`⇧⌘N`、欢迎页与命令面板都开同一张表。Favorites 是真实分区：`components/shell/favorites.ts` 的 pins（持久化在客户端偏好），不是 fixtures。过滤按 Bot 名、Dialogue 名 / 工作区、Session 标题匹配，并隐藏停放分区。Mail / Task / Knowledge / Spaces / Settings 仍是 [`fixtures.ts`](components/shell/fixtures.ts)（停放）。
- **Workbench**：`nsh/base` **DockArea**（仅 center）；独立 Panel 可拖/拆/缩放/放大/关；Panel 内容见 `PanelView`。展开时从窗口上沿起排。启动时从客户端偏好恢复 layout、每个 Panel 的 Nav address、活动 Panel 与 Navigator 宽度 / 折叠分区；不存在的对象（删掉的 Bot、归档的 Dialogue / Session）解析为 `null`，Panel 空着。
- **Panel 内容**（`PanelView` 按 address 分派）：`session` → `SessionPanel` → `ChatPane`（`chat/ChatHeader` + `chat/Transcript` + `chat/ApprovalCard` + `chat/Composer`，各自只持一份状态；草稿、附件与审批队列在 `SessionController`，每个 Panel 取自己的 controller，同一 Session 的多个 Panel 共用一份草稿，多个 Session 可并行流式）+ 可收起的 **Inspector**（`features/inspector`：Bot / Dialogue / Sessions / Deliverables / Usage，见下）；`dialogue` → `DialoguePanel`（标题、Bot、工作区、会话列表、`New Session`）；`bot` → `BotPanel`（名称 / 模板 / preset / 模型 / 初始化 / 删除 + Dialogue 列表 + 新建 Dialogue）；未知与停放分区保留 B0 占位。回复的 Markdown 用 `chat/markdown.tsx` 的 `TextView`；有序列表的 marker 栏按文档里最大的序号量宽度（[`markdownLists.ts`](features/dialogue/chat/markdownLists.ts)），因为 nsh 的默认缩进只放得下一位数（10 以后首位被切）。Navigator 在 Session 行及其 Dialogue / Bot 祖先上显示 controller 投影的状态点：执行中（绿）、未读回复、待审批；Bot 行用 identity mark（工作时呼吸）。空 Panel 在还没有 Bot 时显示欢迎页，领到 New Bot 表。
- **Bot identity**：`features/bots/identity.ts` 是唯一真源（8 个 accent、8 个几何 glyph，MyAid 自绘，无角色画）；注册表只存两个 key，未知 key 退回默认。`BotMark` 画圆角 tile + glyph，工作时由 CSS `animate-spin` 的一圈弧线转动（`motion-reduce` 停）。Navigator Bot 行、chat header / message author、Panel tab、Inspector、New Bot 表与 Bot Settings 都用它。
- **New Bot 表**：`features/bots/NewBotSheet.tsx` + `newBot.ts`（一个 `Sheet`，壳里挂一次）。字段：名称、模板（dsh preset）、identity 选择、首个 Dialogue 工作区（系统目录选择器）。创建 = Bot + Dialogue + 首个 Session（Host 在时），随后开该 Session 并 `chat/focus.ts` 把键盘放进 composer；Session 建不成则开 Dialogue 并如实报错。
- **命令、菜单与通知**：[`components/shell/commands.ts`](components/shell/commands.ts) 是唯一命令表（label / shortcut / enabled / 菜单段 / run），同时喂 `Menu.setApplicationMenu`（File / Edit / View / Chat / Window，macOS 前有 app 菜单）与 `⌘K` 的 `CommandPalette`（`nsh/base` `Command` + `Dialog`；另有 Bot / Dialogue / Session 跳转）。快捷键：`⌘N` New Session、`⇧⌘N` New Bot、`⌘K` palette、`⌘F` 过滤、`⌘B` Navigator、`⌥⌘I` Inspector、`⌘\` / `⌘⇧\` 拆分、`⌘[` / `⌘]` 切 Panel、`⌘W` 关 Panel、`⌘.` Stop、`⌘L` Focus Composer。`components/shell/attention.ts` 比较 roster 两帧：回复结束或审批出现、且该 Session 不在前台或窗口无焦点 → 系统通知（`Notifications`，`nsh.json` 已授 `notifications`），点击开该 Session；Dock / taskbar badge = 未读 + 待审批的 Session 数。纯决策函数单测，系统能力不可用时静默。
- **Navigator 右键与表单**：`navMenu.tsx` 用 `nsh/base` `ContextMenu` 包住行内容（右键不选中 / 不打开），Rename 与 New Dialogue 是 `NavigatorSheets.tsx` 的小 `Sheet`。
- **Inspector**：Session Panel 的右侧窄栏（`ResizablePanel`，268–320，`⌥⌘I` 或 tab 上的 toggle，按 Panel 记住，仅本次运行）。文案与壳一致用英文。`features/inspector/state.ts` 只存「哪个 Panel 开着、多宽」；`facts.ts` 读 `session.projections`（`contextPressure` / `tokenUsage`，dsh 没报告就隐去该行）与 `/compact`（`commands.execute`），交付物只读当前 follow 窗口里的 `deliverables/presented` 事件。工作区路径优先「在 Finder 中显示」（`session.openWorkspacePath` + `canOpenWorkspacePath`），否则复制。
- **Bot Settings**：`features/bots/BotSettings.tsx`，一个 `Sheet` 四个分段（Profile / Runs with / Skills / Plugins），由 Inspector 的 Bot 段与 BotPanel 打开（`settings.ts` 存 Bot id，壳里挂一次）。Profile / Runs with 写注册表（名称、说明、identity mark 的颜色与 glyph、模型、思考档、默认工作区）；Skills 读 `skills.list`、Plugins 读 `pluginInventory`（Bot preset 的 `rows`），能力增删没有 dsh Remote —— 走 `presets.ts` 的接缝（`BotPresetWriter`，候选插件 `myaid-plugin-bot-presets`），写不成时如实说明，不伪造 preset id；能写时才按 BOT_SESSION_MAP 记 `assignDerivedPreset`。
- **侧栏底部 Host 行**：`hostConnection` / `refreshHostStatus`，断开时有 Retry；启动时 `loadRegistry()` → 探 Host → 连 dsh，且只在桌面原生跑（web / 无 Host 不崩）。
- 会话标题取自 roster（`sessionList`），未连接时退回 claim 的 title。
- 注册表存放：桌面 `~/.myaid/registry/bots.json`；web / 手机走 `nsh` Storage（键 `myaid.registry.bots`），UI 测试用 `open(…, { storage })` 预置。`nsh test` 的 app 与测试不同 realm，测试不能直接改 app 的 signal。
- **客户端偏好**：[`components/shell/prefs.ts`](components/shell/prefs.ts) 存 Navigator 宽度 / 开合 / 展开分区、Workbench layout / panel address / 活动 Panel、Favorites pins。桌面 `~/.myaid/prefs/client.json`，web / 手机走 Storage（键 `myaid.prefs.shell`）；解析坏了退回默认，地址按当前注册表重解（标题更新，对象不在则空 Panel）。保存 400ms 去抖，启动读完旧偏好后才开始写。
- 桌面隐藏标题栏高度 44。桌面整窗不再为标题栏下推，也不预留 `titleBar().right`。
- 配色沿用 `colors.inset` / `colors.background`。
- 窄屏本阶段占位。

## 前端职责

- TSX 持有产品状态、注册表与业务流程；官方协议客户端直连 dsh。
- Host 控制与系统适配经 Rust 原生模块返回**系统事实**；产品分支由 TypeScript 解释。
- 产品后台（Background）编排：[`lib/background/`](lib/background/)（HostControl + RelayControl 登记动词）；生命周期 DSH 仍走 [`lib/host/`](lib/host/)。Settings 页展示 Host/Relay 单元状态。
- dsh 运行准备 / 启停 / ready / 回收由宿主独占；客户端只调用控制接口与展示状态。

## TSX 与运行时

- 使用 NSH 细粒度响应式；不套用 React hooks，不引入 `solid-js`。
- 订阅与原生句柄在 `cleanup` 中释放；组件卸载 ≠ 后台任务停止。
- 生产代码只使用安装版 NSH 提供的模块；以 `.nsh/types/` 与运行为准。

## UI 组件边界

- 选型顺序：NSH 原语 / `nsh/base` → gallery / `nsh-gallery-ui` 模式 → 产品组合进 [`components/ui`](components/ui/) → 已核实缺口的最小自定义。
- [`components/ui`](components/ui/) 是本仓**样式化基础层**（对齐 gallery `nsh-gallery-ui` 外观 / motion）；主题为官方 shadcn `neutral`。共享视觉规则优先在此层演进，与上游示例对照后再改。
- 壳层可直接使用导航基础设施；需要内栈的业务（如 Dialogue）可在 `features/*` 使用 `createNavStack` / `NavStack` / `NavPage`。
- 功能模块默认经 `components/ui` 组合；直连 `nsh/base` 仅限模块自管导航，以及 `features/dialogue` 内尚未产品化封装的 gallery 控件（`Input` / `TextView` / `Dialog` 等）。
- 布局原语与运行时（`View` / `Text` / `signal` / `mount` / `token`…）从 `nsh` 引入。

## dsh 认证传输

- 认证 WS 用标准 `websocket` 模块：`connect(url, { headers: { Cookie } })`；`AuthenticatedSocket` 只包成官方 dsh 要的 EventTarget 形状。`nsh.json` 的 `capabilities.network.http` 只授予回环 dsh 端点（`/connect`、`/api/remote.mux`、`/api` 前缀）；未授权 URL 由 NSH 以 `ERR_ACCESS_DENIED` 拒绝。
- TS：[`lib/dsh/`](lib/dsh/) — `AuthenticatedSocket`、Connection/Session Facade。Host 控制：[`lib/host/`](lib/host/) + 原生 `HostControl`。说明见 [docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。
- **dsh web wire 类型**：从 [`@myaid/dsh-web-protocol`](../../packages/dsh-web-protocol)（及 `/session`、`/interaction` 等子路径）引用官方 Remote/DTO；版本与 [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 对齐。产品视图 DTO（如扁平 `FlatModelCatalog`）须与官方同名类型区分。不从 `references/` 拷贝类型。
- **模块 × Remote**：Dialogue/Bots → 已挂 `session`（含 `projections`、`canOpenWorkspacePath` / `openWorkspacePath`）+ `skills` + `agentPresets`（含 `updateQueue` / `read` / `select`）；工作区选路径 → `directoryPicker`；Settings → `settings`/`credentials`；附件 → `fileUploads` + `session.attachment`；Plugins → `pluginManager` + `pluginInventory`；Inspector 的 Compact → `commands.execute`。详情与阶段见 [`packages/dsh-web-protocol/README.md`](../../packages/dsh-web-protocol/README.md)。
- **永不调用**：官方 `workspace.*` 会话容器（产品用 Dialogue + Claim 代替）、`account.*`（品牌/账号面）。广义 Task / Knowledge / Note 不是 Session Remote；Today/启停走 HostControl。
- HTTP `/connect` 用标准 `fetch`（可设 Cookie 响应头解析）；勿把认证 URL/token 写入公开 Host status。
- 产品层级见蓝图：**Bot → Dialogue → Session**。Session 认领到 **Dialogue**（一对一官方 Session）；未认领（含旧 `myaid-primary`）不进产品列表。workspace path 属 Dialogue。gallery demos 仅作演示，不新建 Harness Session。
- 桌面注册表 `~/.myaid/registry/bots.json` 为 **REGISTRY_VERSION 4**（`templates` + `bots` + `dialogues`）。v3 文件在读取时迁移：Bot 按 id 得到稳定的 identity（颜色 + glyph），Dialogue 有 `name`（null = 工作区段名），Session claim 有 `archived`。v2 及更早仍拒绝并提示清空。
- 官方 `@deepseek-ai/dsh-*` 的 `/client` 在默认 `browser` 条件下是 ModuleLoader 产物，**无** ESM `installConnection`。做法：`bun run prepare:sdk` 用 Node 条件打出 `lib/dsh/sdk.js`；`nsh.json` 另设 `resolve.conditions: ["node"]` 作兜底。`dev` / `check` / `build` / `test` 均会先 prepare。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。`fs.read: ["/"]` 在 Windows 无效（盘符路径不在 `/` 下）；产品数据用 `${homeDir}/.myaid`。
- **`fs` 只授应用自己的数据**：`read` / `write` 都是 `${homeDir}/.myaid`（注册表、偏好）。nsh 0.5 的 `capabilities.fs` 只有根列表（`${homeDir}` / `${dataDir}` / `${pluginDir}` / 绝对路径），没有「用户选中才可读」的授权，开过 / 拖入的文件也不自动获得读取权 —— 别为附件把 `read` 放宽回 `${homeDir}`。
- **附件走系统对话框**：回形针（`Picker.pickFiles`，不需任何 fs 授权）直接拿到字节；拖放与「Finder 里复制文件再粘贴」只给 `file:` URL，能读则读，读不到（授权外、超出 `readFile` 上限等）就 `chat/attach.ts` 开同一个文件的 `Picker` 让用户点一下 —— 手势不丢、也不要求全盘读权限。策略只有这一处，Composer 与 ChatPane 都调它。
- 本机控制端点（Unix socket / Windows named pipe）、`SMAppService` 等仅在标准 API 缺口核实后添加；升级后复核可否迁回标准 API。
- 修改 `src/lib.rs` 导出后跑 `vp run @myaid/client#check` / `nsh check` 以刷新声明。`HostControl` 与 `RelayControl` 原生模块分别对接 Host/Relay 登记与控制面。

## 开发与打包（NSH CLI + vp）

- 工作区入口：`vp run @myaid/client#dev|check|test|…`（根 `bun run dev` 等同）。
- 日常宿主：`nsh run --target …`（`dev` / `dev:macos` 等）；只起服务用 `nsh dev --server-only`（`dev:server`）。
- `MYAID_HOST_SOCKET` **仅本机桌面**脚本注入（`dev` / `dev:macos`）；默认 Unix sock 或 Windows `\\.\pipe\myaid-host`。`dev:ios` / `dev:android` / `dev:web` / Relay 路径不注入。Windows 本期只保证 HostControl 原生适配可编译；NSH 桌面窗体不在范围。
- 可安装包：`nsh package`（`package:macos` / `package:web`）。根级 App + Host 组装另议；client 的 `package:*` 不是成品分发。

## 状态与验证

- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
