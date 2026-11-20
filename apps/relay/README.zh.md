# dsh-bot-relay

[English](README.md) | 中文

公网上的零知识 Relay。它负责 Pairing 会合，并转发隧道里的密文帧、不解密：它只知道通道号、长度和一段不透明的字节，从不接触密钥或配对秘密。

它不是 Background Service：不在任何 Device 上做 OS 登记，没有数据根，也不读 `DSH_BOT_HOME`。不持 Owner 凭据，不替代 Host 里的 Bridge。它只保留内存状态：此刻登记了哪些 runner id、哪些通道还活着。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)，以及线缆契约 [relay-tunnel](../../docs/architecture/relay-tunnel.md)。

## 入口

| 入口                                     | 用途                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| `GET /`                                  | `dsh-bot-relay`，用来探活                                |
| `GET /v1/health`                         | service、version、`protocol`（隧道协议版本，当前是 1）   |
| `GET /v1/runner`（WebSocket）            | Bridge 的唯一长连接                                      |
| `GET /v1/device?runner=<id>`（WebSocket）| 一条 Device 连接，对应 Bridge 那边的一个通道             |

### Runner 登记

Relay 先发文本帧 `{"type":"challenge","nonce":"<32 个随机字节，base64url>"}`，10 秒内读到 `{"type":"hello","protocol":1,"key":"<Ed25519 公钥>","sig":"<签名>"}`，并验签内容是 `dsh-bot-relay/1 runner\n` 加上 nonce 原始字节。通过就回 `{"type":"ready","runner":"<id>"}`，id 是公钥的 SHA-256 前 20 字节的小写无填充 base32；否则以 `4004` 关闭。

一个 runner id 只有一条连接。新登记成功会把旧连接以 `4002` 关掉。`ready` 之后这条连接只收发二进制帧。

### 帧

| 链路           | 一条 WS 二进制消息                    | 说明                                                                          |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Bridge ↔ Relay | `[u32 通道号][u8 类型][载荷]`，大端   | `1 OPEN`（Relay→Bridge，载荷空）· `2 DATA` · `3 CLOSE`（载荷是 u16 关闭码）   |
| Device ↔ Relay | 载荷本身                              | Relay 加上或去掉通道头，原样转发                                              |

通道号由 Relay 分配，只在这一条 Runner 连接内唯一。

### 关闭码与限制

| 关闭码 | 名字             | 何时                                                         |
| ------ | ---------------- | ------------------------------------------------------------ |
| 4001   | runner-offline   | Device 连进来时这个 runner id 没有连接，或者连接断了         |
| 4002   | replaced         | 同一个 runner 有了新的登记连接                               |
| 4003   | overloaded       | 某个方向积压超过 1 MiB，或者单条消息超过 65 600 字节         |
| 4004   | bad-auth         | 登记失败：`hello` 不对、协议版本不对或验签不过               |
| 4005   | too-many         | 这个 runner 已有 64 条通道，或者来源 IP 超过了连接速率限制   |
| 4006   | idle             | Device 连上后 10 秒内没有发出第一条消息                      |
| 4010   | pairing-rejected | 由 Bridge 发出：配对握手被拒                                 |
| 4011   | handshake-failed | 由 Bridge 发出：模式字节未知，或日常握手的第 1 条解不开      |

Bridge 经 `CLOSE` 帧给出的关闭码原样用来关闭 Device 的 WS，包括 `1000`。WebSocket 协议载不了的码（`1000` 和 `3000`–`4999` 以外）改成 `1011` 并记日志。Relay 每 20 秒向两边发 ping；Runner 连接断开时，它名下的所有通道都以 `4001` 关闭。

上面每个数字都在 [`src/limits.rs`](src/limits.rs)，关闭码在 [`src/frame.rs`](src/frame.rs)。

## 命令

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
cargo test -p dsh-bot-relay --features frame-tap
```

`--bind` 是 IP 地址，默认 `127.0.0.1`。`--port` 默认 `8787`。日志级别是 `RUST_LOG`。

`--ready-stdout` 在监听后打印 `{"event":"ready","port":<port>}`，给脚本和测试用。

`--frame-tap PATH` 把每一帧转发的二进制帧追加成一行 JSON——`{"seq":n,"link":"bridge"|"device","dir":"in"|"out","bytes":"<base64url>"}`——端到端测试靠它证明 Relay 只见过密文。这个 flag 只存在于启用 `frame-tap` feature 的构建里，release 构建根本无法录制；上面第二条 `cargo test` 会打开它跑那个读文件的用例。

## Known limitations

- 不托管 web 版 Client。浏览器经它自己的通道到 Runner，不经过本进程。
- 状态全在内存：重启后登记和通道都没了，Device 重连。
- 没有持久化、没有 metrics 入口、没有按 Owner 计费，也不自己做 TLS——公网部署时放在反向代理后面。
- 连接速率限制是按来源 IP 的内存计数，放在代理后面时需要代理把真实客户端地址带过来。
