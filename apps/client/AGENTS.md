# NSH 客户端约束

补充[根约束](../../AGENTS.md)。职责以[架构](../../docs/ARCHITECTURE.md)与 [DSH 原则](../../docs/DSH_PRINCIPLES.md)为准。

## 布局（NSH mixed）

- 本目录是官方 **mixed** 应用：`App.tsx` 为 TSX 入口，`nsh.json` `"rust": "."`，Rust 在同级 `Cargo.toml` / `src/lib.rs`（`#[native_module("myaid/native")]`）。
- 产品 TSX 模块放 `components/`（及按需子目录）；静态资源放 `assets/`。
- **不要**为对齐旧 dsh-bot 客户端而引入平行的 `frontend/{ui,application,infrastructure}` 树，除非架构文档明确改判。

## 前端职责

- TSX 持有产品状态、注册表与业务流程；官方协议客户端直连 dsh。
- Host 控制与系统适配经 Rust 原生模块返回**系统事实**；产品分支由 TypeScript 解释。
- dsh 运行准备 / 启停 / ready / 回收由宿主独占；客户端只调用控制接口与展示状态。

## TSX 与运行时

- 使用 NSH 细粒度响应式；不套用 React hooks，不引入 `solid-js`。
- 订阅与原生句柄在 `cleanup` 中释放；组件卸载 ≠ 后台任务停止。
- 生产代码只使用安装版 NSH 提供的模块；以 `.nsh/types/` 与运行为准。

## 原生接口与权限

- 新增文件 / 网络 / 进程访问时同步更新 `nsh.json` capabilities。
- Cookie WebSocket、Unix socket、`SMAppService` 等仅在标准 API 缺口核实后添加；升级后复核可否迁回标准 API。
- 修改 `src/lib.rs` 导出后跑 `bun run check` / `nsh check` 以刷新声明。

## 状态与验证

- 宿主发现、generation、换连与退役清理应有单一协调者；切换对象后丢弃旧异步结果。
- Bun 单测不能证明 NSH 权限或原生绑定；触及这些能力时用 `nsh test` / 集成入口。
