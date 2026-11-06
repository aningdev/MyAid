# myaid-relay

多端密文帧转发空壳；**RelayControl** 提供本机就绪与 Relay 单元 Background Service 登记（macOS `SMAppService` 事实；开发态 `serve` 不登记）。设备连接路由与有界投递队列尚未实现。约束见 [AGENTS.md](AGENTS.md)。

```sh
cargo run -p myaid-relay
cargo test -p myaid-relay
```
