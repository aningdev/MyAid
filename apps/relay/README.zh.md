# dsh-bot-relay

[English](README.md) | 中文

公网上的零知识 Relay。它负责 Pairing 会合，并转发密文帧、不解密。Pairing 和转发尚未实现；本进程只提供 `GET /`（`dsh-bot-relay`）和 `GET /v1/health`（service、version、protocol、uptime）。

它不是 Background Service：不在任何 Device 上做 OS 登记，没有数据根，也不读 `DSH_BOT_HOME`。不持 Owner 凭据，不替代 Host 里的 Bridge。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)。

## 命令

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
```

`--bind` 是 IP 地址，默认 `127.0.0.1`。`--port` 默认 `8787`。日志级别是 `RUST_LOG`。

## Known limitations

- Pairing、身份密钥和密文转发都还没有，也没有存储。
- 这里不向 launchd、systemd 或 Windows `Run` 键登记。
