# myaid-relay

[English](README.md) | 中文

常驻 Relay 进程，布局照 lorca 的 `crates/relay`：`config.rs`（路径、端口、日志）、`routes.rs`（本机控制 API）、`run.rs`（绑定、token、优雅停止）、`service.rs`（本单元 OS 登记）。`GET /` 回 `myaid-relay`、`GET /v1/health` 回版本与协议，两者免 token；`/registration*` 要数据根的 `relay/serve-token`。

密文帧转发、身份密钥与配对**尚未实现**：移动端不在本轮，开始时照 lorca 的形状补（[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)）。它从不解密载荷、不持 owner 凭据、不替代 Host Bridge 授权。

约束：[AGENTS.md](AGENTS.md)。架构 §7 / Bridge–Relay：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。共用启动计划：[`myaid-service`](../../crates/myaid-service/README.zh.md)。

## 命令

```sh
cargo run -p myaid-relay -- serve-app --port 8787
cargo run -p myaid-relay -- serve --data-root PATH [--port N]
cargo run -p myaid-relay -- service install|uninstall|status
cargo check -p myaid-relay
cargo test -p myaid-relay
```

默认端口 `8787`（`MYAID_RELAY_PORT`），数据根 `~/.myaid`（`MYAID_DATA_ROOT`），日志级别 `RUST_LOG`。

## Known limitations

- 还没有存储、身份、配对与转发；转发开始前刻意不引入数据库。
- OS 登记只在测试里快照，测试从不安装。
