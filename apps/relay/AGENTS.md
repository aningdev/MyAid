# Relay 约束

补充[根约束](../../AGENTS.md)。修改公网 Relay 时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)。

## 职责

- 公网上的零知识 Relay：只做 Pairing 会合和密文帧转发，不解密，不含业务逻辑。
- Pairing 和转发尚未实现。现在只有可启动的 `serve`，以及 `GET /`、`GET /v1/health`。
- 不在任何 Device 上做 OS 登记。没有数据根，不读 `DSH_BOT_HOME`。
- 不持 Owner 凭据，不替代 Host 内的 Bridge，也不经过 Host 的本机控制面。

## 模块

- `main.rs` 只装配 `serve`。
- `config.rs` 只解析 `--bind`、`--port`、`--ready-stdout`。
- `routes.rs` 只有 `GET /` 和 `GET /v1/health`。
- `run.rs` 绑定监听套接字，并在退出信号时停掉。

## 验证

- `cargo check -p dsh-bot-relay` / `cargo test -p dsh-bot-relay`（`GET /` 与 `GET /v1/health` 走真实 HTTP）。
- 不安装、不启动系统后台服务。
