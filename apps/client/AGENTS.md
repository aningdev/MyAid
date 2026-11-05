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
- 产品 TSX 模块放 `components/`（及按需子目录）；功能域放 `features/`；工作台状态放 `workspace/`；静态资源放 `assets/`。
- 保持 NSH mixed 目录，不另起平行 `frontend/{ui,application,infrastructure}` 树，除非架构文档明确改判。

## 工作台（模块页宿主）

- 壳（[`components/AppShell.tsx`](components/AppShell.tsx)）只做：窗口标题栏、一级 `NavRail` / `AppTabBar`、按 `moduleId` 挂载一个 **`module.Page`**。
- **二次布局属各业务**：不要在壳层假定 List|Main|Context。Dialogue 在 [`features/dialogue/Page.tsx`](features/dialogue/Page.tsx) 内自管桌面三栏与移动内栈。
- 模块注册：[`workspace/modules.ts`](workspace/modules.ts)；契约：[`workspace/types.ts`](workspace/types.ts)（`Page`）。
- 移动底栏显隐跟 [`moduleAtRoot`](workspace/state.ts)；模块进入内部页时自行 `setModuleAtRoot(false)`。
- 默认一级模块为 `today`（空白页），不默认进入 Dialogue 布局。

## 前端职责

- TSX 持有产品状态、注册表与业务流程；官方协议客户端直连 dsh。
- Host 控制与系统适配经 Rust 原生模块返回**系统事实**；产品分支由 TypeScript 解释。
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

- NSH **0.4** 标准 `websocket.connect` **仍拒绝** Cookie 握手头；官方 `/api/remote.mux` 必须经原生 [`CookieWebSocket`](src/cookie_websocket/)（导出在 `myaid/native`）。
- TS：[`lib/dsh/`](lib/dsh/) — `AuthenticatedSocket`、Connection/Session Facade、`smokeDshAuthTransport`。Host 控制：[`lib/host/`](lib/host/) + 原生 `HostControl`。说明见 [docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。
- HTTP `/connect` 用标准 `fetch`（可设 Cookie 响应头解析）；勿把认证 URL/token 写入公开 Host status。
- 产品会话按蓝图认领到 Bot，一条会话一条官方 Session。固定 `myaid-primary` 只是现有接线，不是产品模型。gallery demos 仅作演示，不新建 Harness Session。
- 官方 `@deepseek-ai/dsh-*` 的 `/client` 在默认 `browser` 条件下是 ModuleLoader 产物，**无** ESM `installConnection`。做法：`bun run prepare:sdk` 用 Node 条件打出 `lib/dsh/sdk.js`；`nsh.json` 另设 `resolve.conditions: ["node"]` 作兜底。`dev` / `check` / `build` / `test` 均会先 prepare。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。
- Cookie WebSocket、Unix socket、`SMAppService` 等仅在标准 API 缺口核实后添加；升级后复核可否迁回标准 API。
- 修改 `src/lib.rs` 导出后跑 `vp run @myaid/client#check` / `nsh check` 以刷新声明。

## 开发与打包（NSH CLI + vp）

- 工作区入口：`vp run @myaid/client#dev|check|test|…`（根 `bun run dev` 等同）。
- 日常宿主：`nsh run --target …`（`dev` / `dev:macos` 等）；只起服务用 `nsh dev --server-only`（`dev:server`）。
- `MYAID_HOST_SOCKET` **仅本机桌面**脚本注入（`dev` / `dev:macos`）；`dev:ios` / `dev:android` / `dev:web` / Relay 路径不注入。
- 可安装包：`nsh package`（`package:macos` / `package:web`）。根级 App + Host 组装另议；client 的 `package:*` 不是成品分发。

## 状态与验证

- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
