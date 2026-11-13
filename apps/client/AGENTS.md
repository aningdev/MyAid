# NSH 客户端约束

补充[根约束](../../AGENTS.md)。职责与结构以[架构 §5](../../docs/ARCHITECTURE.md)为准，单元契约见 [README](README.md)。

## 读什么

- **设计**（组件、布局、视觉、交互、文案）：先 [Design Guides](../../references/nsh/website/docs/design-guides.md)。
- **编码**（状态、响应式、组件边界、焦点、列表、异步）：[Coding Guides](../../references/nsh/website/docs/coding-guides.md)。
- **组件与样式**：`references/nsh/examples/nsh-gallery-ui`、`references/nsh/examples/gallery`、`references/nsh/website`。
- **类型与运行时**：安装版 `.nsh/types/`；生产代码只用安装版 NSH 模块。
- **dsh 能力面**：先对照官方 `dsh web` 与只读 `references/deepseek-harness` 的 Remote；NSH 侧只建产品 UI，不移植其 Web GUI / 审批页 / 品牌文案。

## 布局（NSH mixed）

- 本目录是官方 mixed 应用：`App.tsx` 入口，`nsh.json` `"rust": "."`，Rust 在同级 `Cargo.toml` / `src/lib.rs`。
- `components/` 是壳与样式：壳在 `components/shell/`（UI 与状态同目录），样式层在 `components/ui/`；`features/` 放产品域，由 Panel 按 Nav address 挂；`lib/` 放协议、宿主与产品后台适配。
- 不另起平行 `frontend/{ui,application,infrastructure}` 树。新增文件先落现有目录；线框不混入产品路径。

## TSX 与运行时

- 用 NSH 细粒度响应式；不套 React hooks，不引入 `solid-js`。
- 订阅与原生句柄在 `cleanup` 中释放；组件卸载 ≠ 后台任务停止（运行中的 Session 在 Panel 关掉后继续）。
- 每个状态 / 策略只有一个所有者：注册表写入口、`SessionController`、壳的 Panel 状态不各自复制一份。派生值用 `computed`，别在视图里重算第二套模型。

## UI 边界

- 选型顺序：NSH 原语 / `nsh/base` → gallery / `nsh-gallery-ui` 模式 → 产品组合进 [`components/ui`](components/ui/) → 已核实缺口的最小自定义。
- `components/ui` 是本仓样式化基础层（对齐 gallery 外观 / motion），主题为官方 shadcn `neutral`。共享视觉规则先在此层演进。
- 功能模块默认经 `components/ui` 组合；直连 `nsh/base` 仅限模块自管导航与尚未封装的 gallery 控件。
- 布局原语与运行时（`View` / `Text` / `signal` / `mount` / `token`…）从 `nsh` 引入。

## dsh 传输与产品层级

- 认证 WS 用标准 `websocket`：`connect(url, { headers: { Cookie } })`；`AuthenticatedSocket` 只包装成官方 dsh 要的 EventTarget。`nsh.json` 的 `capabilities.network.http` 只放行回环 dsh 端点；未授权 URL 由 NSH 以 `ERR_ACCESS_DENIED` 拒绝。
- wire 类型从 [`@myaid/dsh-web-protocol`](../../packages/dsh-web-protocol) 引用，版本与 [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 对齐；不从 `references/` 拷贝类型。产品视图 DTO 与官方同名类型分开命名。
- Remote 优先复用官方已挂载面；新增命名空间先 `$mount` 其 `/remote`。不调用 `account.*`。
- **Dialogue 建在 dsh Workspace 上**（[ADR 0005](../../docs/adr/0005-dialogue-on-dsh-workspace.md)）：`workspace.create` / `rename` / `archiveSession` / `unarchiveSession` / `pinSession` / `unpinSession` / `insertSessionBefore` 是名字、置顶、归档与顺序的**唯一写入口**；`session.create({ workspaceId })` 负责 create-then-attach。不要在注册表里重建这些字段。
- `workspace.follow` 是 Workspace 状态的**唯一读入口**：`features/workspace/state.ts` 在 `lib/dsh/workspace-frames.ts` 把帧校验后投影成 NSH signal（`updatedAt` 新者胜），视图只读它；Remote 返回值不写状态。官方 `ClientWorkspaceModel`（`lib/types/client/model.js`，纯 ESM）留到下一批与其余官方 client model 一起装载，本批不自造第二份模型。
- 产品层级是 **Bot → Dialogue → Session**：Session 认领到 Dialogue（一对一官方 Session），未认领不进产品列表。一个 Dialogue = 一个 Bot 对一个 Workspace 的视角；同一个目录上的两个 Bot 共享 Workspace 的顺序、置顶与归档。
- `@deepseek-ai/dsh-*` 的 `/client` 在默认 `browser` 条件下无 ESM `installConnection`；用 `bun run prepare:sdk` 打出的 `lib/dsh/sdk.js`（`nsh.json` 的 `resolve.conditions: ["node"]` 兜底）。勿手改该产物。
- 认证与心跳细节的唯一下沉文档：[docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。`fs.read: ["/"]` 在 Windows 无效；产品数据用 `${homeDir}/.myaid`。
- **`fs` 只授应用自己的数据**：`read` / `write` 都是 `${homeDir}/.myaid`。nsh 0.5 没有「用户选中才可读」的授权，别为附件放宽回 `${homeDir}`。
- **附件只走系统选择器**：回形针直接拿字节；拖放 / 粘贴只给 `file:` URL，授权外或读不了时由 [`chat/attach.ts`](features/dialogue/chat/attach.ts) 开同一文件的 `Picker`。策略只此一处。
- 本机控制端点（Unix socket / named pipe）、`SMAppService` 仅在标准 API 缺口核实后添加；升级后复核可否迁回。
- 修改 `src/lib.rs` 导出后跑 `nsh check` / `vp run @myaid/client#check` 刷新声明。`HostControl` / `RelayControl` 只给宿主与登记事实，不当业务网关。
- Settings ⇢ Background Services 是 [ADR 0002](../../docs/adr/0002-dual-background-services.md) 的客户端侧：只编排 query / enable / stop，不代 Host / Relay 做决定。

## 验证

- 应用生命周期走官方 `nsh check` / `nsh test`；工作区编排用 `vp run @myaid/client#…`。命令清单在 README。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
- 真 Host 冒烟是 opt-in（`MYAID_SMOKE_HOST_SOCKET`）；默认 `nsh test` 不得需要活 Host。
- 测试隔离：所有打开 app 的测试经 [`test/open`](test/open.ts)（`nsh test` 的 host 参数 `myaidTest`），注册表与 prefs 落到该 app 的 Storage，绝不用真实 `~/.myaid`；`test/data-root.test.tsx` 是这条 seam 的 guard。没有 Host 的 app 测试用 [`test/workspaces`](test/workspaces.ts) 预置 Workspace baseline（与 dsh 发出的帧同形），生产路径只读 `workspace.follow`。
- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。

## 文档

改行为先改真源（[ARCHITECTURE](../../docs/ARCHITECTURE.md) / [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) / ADR），再改 README 与本文的指针。本文只留护栏与去向，不写教程、清单复述或历史。
