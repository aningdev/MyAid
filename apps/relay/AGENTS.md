# Relay 约束

补充[根约束](../../AGENTS.md)。修改常驻 Relay、本机控制面或服务登记时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md) §7、[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md) 与 [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)（Bridge / Relay 边界）。

## 职责

- 只做端到端**密文帧**转发；不解密业务载荷。
- 不持 owner 凭据；不替代执行侧输入队列或 dsh Session。
- 设备授权与官方协议转发属 Host 内 Bridge；Relay 不另建授权策略。
- 本轮只落结构与常驻机制：身份密钥、配对、密文转发随后续移动端一并做（ADR 0007），不先造半套协议。

## 模块

- `main.rs` 只装配与分派（`serve-app` / `serve` / `service`）；`config.rs` 只做路径、端口与日志配置。
- `routes.rs` 是本机控制面（照 lorca）：`/`、`/v1/health` 免 token，`/registration*` 要数据根 `relay/serve-token` 的 Bearer，`Origin` / 非本端口 `Host` 403。
- `run.rs` 绑定、写 token、优雅停止；`service.rs` 用 `crates/myaid-service` 登记本单元（与 Host 同样的 plist / 单元 / Run 键，只换名字）。
- 与 Host 存活解耦，不经过 Host 的控制面。

## 验证

- 改动用 `cargo check -p myaid-relay` / `cargo test -p myaid-relay`（含未认证拒绝与健康检查）。
- 注册 / 注销只以真机为准；测试只快照计划。
