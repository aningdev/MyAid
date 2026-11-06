# Rust 宿主约束

补充[根约束](../../AGENTS.md)。修改宿主、服务登记或 macOS 打包时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)、[BLUEPRINT](../../docs/BLUEPRINT.md)。

## 模块与生命周期

- `DshProcess` 独占 dsh 生命周期；公开入口为 `Lifecycle`。内部锁、guardian、环境与日志保持私有。
- `HostControl` 提供本机管理、连接发现与共享协议；**只调用 `Lifecycle`**，不另建启停策略。Background 登记走 `background_registration` 薄适配（macOS `SMAppService` 查询/登记事实；开发态 `serve` / `serve-app` 显式 Host 不触发 OS 登记）。
- `main.rs` 只装配与分派；`lib.rs` 导出客户端原生适配所需的共享控制 Interface。
- 控制协议集中在 `host_control/protocol.rs`（含 `recovering` 等相位）；修改时同时核对宿主接收、客户端解码与失败语义。公开 status 与认证连接信息分离。

## 后台身份

- UI 退出不停止已接纳工作；首次打开只查询，用户明确启动才申请后台运行。
- 目标经 `SMAppService` 登记 App 内辅助程序；NSH 决定产品顺序，Rust 返回系统调用事实。
- 开发模式显式连接同一 Host，不登记 App 服务；脚本只调公开控制入口。
- 不因组件缺失恢复「客户端自行 spawn dsh」的回退路径。

## 联调与成品

- 生命周期与协议修改验证隔离宿主进程；影响共享导出时还须 NSH 原生绑定联调。
- `SMAppService` 注册 / 批准 / 注销以签名成品为准；`cargo test` 或 ad-hoc 包不能替代。
