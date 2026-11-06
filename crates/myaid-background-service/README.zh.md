# myaid-background-service

[English](README.md) | 中文

Host 与 Relay 并行使用的共享 **Background Service** OS 登记契约。平台适配层回报系统事实；`HostControl` 与 `RelayControl` 暴露同一套动词（`ServiceUnit`、登记相位 / 快照 / 操作）。

消费者：[`apps/host`](../../apps/host/README.zh.md)、[`apps/relay`](../../apps/relay/README.zh.md)。架构 / Host–Relay 边界：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。

## 命令

```sh
cargo check -p myaid-background-service
cargo test -p myaid-background-service
```

## 布局

- `src/lib.rs` — 公开再导出
- `src/registration.rs` — 契约类型（`CONTRACT_VERSION`、单元、相位、快照）

无独立二进制；链入 Host 与 Relay。
