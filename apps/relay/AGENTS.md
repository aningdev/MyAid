# Relay 约束

补充[根约束](../../AGENTS.md)。修改多端转发、设备连接路由或投递队列时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md) §7 与 [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)（Bridge / Relay 边界）。

## 职责

- 只做端到端**密文帧**转发与有界投递队列；不解密业务载荷。
- 不持 owner 凭据；不替代执行侧输入队列或 dsh Session。
- 设备授权与官方协议转发属 Host 内 Bridge；Relay 不另建授权策略。

## 模块

- `main.rs` 只装配与进程入口；公开类型与转发逻辑放 `lib.rs`（及后续子模块）。
- 入口集中公开 Interface；连接表、队列与路由实现保持私有。

## 验证

- 改动用 `cargo check -p myaid-relay` / `cargo test -p myaid-relay`。
- 涉及多端路径时，与 Host Bridge 契约对照验收；不单测「明文业务语义」。
