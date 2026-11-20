# dsh-bot-relay

[English](README.md) | 中文

公网上的零知识 Relay。它负责 Pairing 会合，并转发隧道里的密文帧、不解密：它只知道通道号、长度和一段不透明的字节，从不接触密钥或配对秘密。

它不是 Background Service：不在任何 Device 上做 OS 登记，没有数据根，也不读 `DSH_BOT_HOME`。不持 Owner 凭据，不替代 Host 里的 Bridge。它只保留内存状态：此刻登记了哪些 runner id、哪些通道还活着。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)，以及线缆契约 [relay-tunnel](../../docs/architecture/relay-tunnel.md)。

## 入口

| 入口                                      | 用途                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| `GET /`                                   | `dsh-bot-relay`，用来探活                              |
| `GET /v1/health`                          | service、version、`protocol`（隧道协议版本，当前是 1） |
| `GET /v1/runner`（WebSocket）             | Bridge 的唯一长连接                                    |
| `GET /v1/device?runner=<id>`（WebSocket） | 一条 Device 连接，对应 Bridge 那边的一个通道           |

### Runner 登记

Relay 先发文本帧 `{"type":"challenge","nonce":"<32 个随机字节，base64url>"}`，10 秒内读到 `{"type":"hello","protocol":1,"key":"<Ed25519 公钥>","sig":"<签名>"}`，并验签内容是 `dsh-bot-relay/1 runner\n` 加上 nonce 原始字节。通过就回 `{"type":"ready","runner":"<id>"}`，id 是公钥的 SHA-256 前 20 字节的小写无填充 base32；否则以 `4004` 关闭。

一个 runner id 只有一条连接。新登记成功会把旧连接以 `4002` 关掉。`ready` 之后这条连接只收发二进制帧。

### 帧

| 链路           | 一条 WS 二进制消息                  | 说明                                                                        |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Bridge ↔ Relay | `[u32 通道号][u8 类型][载荷]`，大端 | `1 OPEN`（Relay→Bridge，载荷空）· `2 DATA` · `3 CLOSE`（载荷是 u16 关闭码） |
| Device ↔ Relay | 载荷本身                            | Relay 加上或去掉通道头，原样转发                                            |

通道号由 Relay 分配，只在这一条 Runner 连接内唯一。

### 关闭码与限制

| 关闭码 | 名字             | 何时                                                                                                 |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------- |
| 4001   | runner-offline   | Device 连进来时这个 runner id 没有连接，或者连接断了                                                 |
| 4002   | replaced         | 同一个 runner 有了新的登记连接                                                                       |
| 4003   | overloaded       | 某个方向积压超过 1 MiB，或者单条消息超过 65 600 字节（含通道头，所以 Device 的消息最多 65 595 字节） |
| 4004   | bad-auth         | 登记失败：`hello` 不对、协议版本不对或验签不过                                                       |
| 4005   | too-many         | 这个 runner 已有 64 条通道，或者客户端 IP 超过了连接速率限制                                         |
| 4006   | idle             | Device 连上后 10 秒内没有发出第一条消息                                                              |
| 4010   | pairing-rejected | 由 Bridge 发出：配对握手被拒                                                                         |
| 4011   | handshake-failed | 由 Bridge 发出：模式字节未知，或日常握手的第 1 条解不开                                              |

Bridge 经 `CLOSE` 帧给出的关闭码原样用来关闭 Device 的 WS，包括 `1000`。WebSocket 协议载不了的码（`1000` 和 `3000`–`4999` 以外）改成 `1011` 并记日志。Relay 每 20 秒向两边发 ping；Runner 连接断开时，它名下的所有通道都以 `4001` 关闭。

上面每个数字都在 [`src/limits.rs`](src/limits.rs)，关闭码在 [`src/frame.rs`](src/frame.rs)。

## 命令

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout] [--trusted-proxy IP]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
cargo test -p dsh-bot-relay --features frame-tap
```

`--bind` 是 IP 地址，默认 `127.0.0.1`。`--port` 默认 `8787`。日志级别是 `RUST_LOG`。

`--ready-stdout` 在监听后打印 `{"event":"ready","port":<port>}`，给脚本和测试用。

`--trusted-proxy IP` 可以重复，默认没有。Device 的限速和日志用 TCP 对端。只有对端属于这些地址时，Relay 才从 `X-Forwarded-For` 取客户端：最后一个头里最右边的那一项，也就是代理自己看到的地址；它左边的条目来自客户端，一律不用。没有这个头，或最右一项不是裸 IP，就仍用对端。没被列出的对端一律忽略该头，伪造的头拆不开限额。

`--frame-tap PATH` 把每一帧转发的二进制帧追加成一行 JSON——`{"seq":n,"link":"bridge"|"device","dir":"in"|"out","bytes":"<base64url>"}`——端到端测试靠它证明 Relay 只见过密文。这个 flag 只存在于启用 `frame-tap` feature 的构建里，release 构建根本无法录制；上面第二条 `cargo test` 会打开它跑那个读文件的用例。

## 部署

[`deploy/deploy.sh`](deploy/deploy.sh) 一条命令把 Relay 部署到一台 VPS 上，重跑一次就是升级。

### 前提

| 需要 | 要求                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| VPS  | Debian 或 Ubuntu，x86_64 或 arm64，systemd；能用 SSH 以 root 或带 sudo 的用户登录。512 MB 内存就够                                        |
| 域名 | 一条 A 记录（有 IPv6 再加 AAAA）指向这台 VPS。用 Cloudflare 时设成「仅 DNS」（灰云）：证书由 Caddy 直接签发，WebSocket 长连接也不经过 CDN |
| 端口 | 80 和 443 对公网开放（包括云厂商的安全组），且没被别的程序占用                                                                            |
| 本机 | 本仓的检出、`rustup`、`cargo`、`ssh`。不需要 Docker 或交叉编译工具链                                                                      |

### 一条命令

```sh
apps/relay/deploy/deploy.sh <ssh-target> <domain>
# 例：apps/relay/deploy/deploy.sh root@203.0.113.7 relay.example.com
```

`<ssh-target>` 也可以是 `~/.ssh/config` 里的 Host 别名。脚本在本机按 VPS 的 CPU 编出 musl 静态二进制（用 Rust 自带的 `rust-lld` 链接），连同 [`deploy/install.sh`](deploy/install.sh) 上传，在 VPS 上以 root 运行：

1. 检查域名已经解析到这台机器，且 80/443 空闲；
2. 没有 Caddy 时从 Caddy 官方 apt 源安装；
3. 安装 `/usr/local/bin/dsh-bot-relay` 和 systemd 服务 `dsh-bot-relay`：`DynamicUser`，只监听 `127.0.0.1:8787`，`--trusted-proxy 127.0.0.1`；
4. 写 `/etc/caddy/dsh-bot-relay.caddy` 并 import 进 Caddyfile，由 Caddy 自动签发、续期证书；
5. ufw 开着时放行 80/443；
6. 等到 `https://<domain>/v1/health` 有回答为止。

在 NAT 后面、公网 IP 不在网卡上的机器，加 `--skip-dns-check`。

### 之后

- **让 Runner 用它**：Host 的环境变量设 `DSH_BOT_RELAY_URL=https://<domain>`。用项目默认 Relay 时不用设。
- **升级**：拉取新代码后重跑同一条命令。服务重启会断开所有隧道，Runner 和 Device 会自动重连。
- **排查**：`curl https://<domain>/v1/health`；在 VPS 上看 `journalctl -u dsh-bot-relay -u caddy -n 50`。
- **卸载**（在 VPS 上，Caddy 保留）：

```sh
systemctl disable --now dsh-bot-relay
rm /etc/systemd/system/dsh-bot-relay.service /usr/local/bin/dsh-bot-relay /etc/caddy/dsh-bot-relay.caddy
sed -i '\|^import /etc/caddy/dsh-bot-relay.caddy$|d' /etc/caddy/Caddyfile && systemctl reload caddy
```

## Known limitations

- 不托管 web 版 Client。浏览器经它自己的通道到 Runner，不经过本进程。
- 状态全在内存：重启后登记和通道都没了，Device 重连。
- 没有持久化、没有 metrics 入口、没有按 Owner 计费，也不自己做 TLS——公网部署时放在反向代理后面（见[部署](#部署)）。
- 连接速率限制按客户端 IP 在内存里计数。放在反向代理后面时，用 `--trusted-proxy` 标出代理地址（本机 Caddy 是 `127.0.0.1`），Relay 才从 `X-Forwarded-For` 取客户端；不标的话，所有 Device 共用代理的那一个限额。
