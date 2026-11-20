# Relay 约束

补充[根约束](../../AGENTS.md)。修改公网 Relay 时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)、[relay-tunnel](../../docs/architecture/relay-tunnel.md)。

## 职责

- 公网上的零知识 Relay：只做 Pairing 会合和密文帧转发，不解密，不含业务逻辑。通道号、长度和载荷以外的东西都不看。
- 不在任何 Device 上做 OS 登记。没有数据根，不读 `DSH_BOT_HOME`。
- 不持 Owner 凭据，不替代 Host 内的 Bridge，也不经过 Host 的本机控制面。不托管 web 版 Client。
- 状态只在内存：登记表和通道表随进程消失，重启不需要迁移。

## 模块

每个状态只有一份所有者，别的地方只读或发消息。

- `main.rs`：只装配 `serve`、信号处理和日志。
- `config.rs`：只解析 `--bind`、`--port`、`--ready-stdout`、`--frame-tap`、`--trusted-proxy`。
- `routes.rs`：只装配路由（`GET /`、`GET /v1/health`、两条 WebSocket 入口）和 `Api`。Device 入口在这里把可信代理的 `X-Forwarded-For` 解析成客户端 IP。
- `run.rs`：绑定监听套接字，建 `Registry`／`RateLimiter`／`Tap`，等退出信号。
- `runner.rs`：`Registry` 是「哪个 runner id 现在归哪条连接」的唯一所有者，`generation` 保证旧连接收尾时删不掉新登记。Runner 链路自己拥有它的通道表和通道号分配。
- `device.rs`：一条 Device 连接只映射一个通道，积压计数按方向记在它拿到的 `Arc<AtomicUsize>` 上。
- `frame.rs`：帧编码解码、关闭码、关闭 WS 的助手。线缆格式的唯一实现。
- `limits.rs`：所有限制数值。别在别处写数字。
- `auth.rs`：nonce、`hello` 验签、runner id（公钥 SHA-256 前 20 字节 base32）。
- `rate.rs`：按来源 IP 的连接速率。
- `tap.rs`：`frame-tap` feature 下的帧录制，生产构建里是空实现。

## 边界

- Relay 不发业务语义的关闭码：`4001`–`4006` 是它自己的，`1000`／`4010`／`4011` 只从 Bridge 的 `CLOSE` 帧透传。Bridge 给的码不合法时按 `1011` 关闭并记日志，不要猜它的意思。
- 不要在这里加存储、账户、指标聚合或 TLS 终结；需要时先改 [relay-tunnel](../../docs/architecture/relay-tunnel.md)。
- Device 与 Bridge 都不许把明文交给 Relay。任何「顺手解一下」的代码都是越界。

## 验证

- `cargo check -p dsh-bot-relay` / `cargo test -p dsh-bot-relay`（`tests/local_api.rs` 走真实 HTTP，`tests/tunnel.rs` 起真实进程走真实 WebSocket）。
- `the_frame_tap_records_every_relayed_frame` 只在打开 `frame-tap` feature 时编译，它证明 Relay 只见过密文；根 `bun run test` 和 `bun run check` 用 `--all-features`，CI 会跑到它。单独跑用 `cargo test -p dsh-bot-relay --features frame-tap`。
- 不安装、不启动系统后台服务。
- `deploy/` 的脚本会改动远端服务器：只在 Owner 明确给出目标机器和域名时运行，不拿它做验证。改 `install.sh` 后先 `bash -n`，再在 Owner 指定的机器上重跑一次部署确认。
