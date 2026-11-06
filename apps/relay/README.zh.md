# myaid-relay

[English](README.md) | 中文

多端**密文帧**转发空壳。**RelayControl** 提供本机就绪与 Relay 单元 Background Service 登记（macOS `SMAppService` 事实；开发态 `serve` 不登记）。设备连接路由与有界投递队列尚未实现。

约束：[AGENTS.md](AGENTS.md)。架构 §7 / Bridge–Relay：[ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。共享登记契约：[`myaid-background-service`](../../crates/myaid-background-service/README.zh.md)。

## 命令

```sh
cargo run -p myaid-relay
cargo check -p myaid-relay
cargo test -p myaid-relay
```

## Known limitations

- 端到端设备路由与有界投递队列仍为空壳。
- 不解密业务载荷、不持 owner 凭据、不替代 Host Bridge 授权策略。
