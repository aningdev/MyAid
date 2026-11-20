# dsh-bot-host

[English](README.md) | 中文

dsh-bot 的 Rust 宿主，照 lorca 的 `lorca serve` 成形：独占官方 `dsh` 进程生命周期，并在 `127.0.0.1:4872` 提供回环控制 API——Client 自己启动它、探活它、订阅它。OS 登记在本单元的 `service` 模块（`src/service/`：launchd、systemd、Windows `Run` 键）。登记快照只描述 Host。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)、[0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md)。

## 控制 API

`GET /` 无需 token，回 `dsh-bot`，让启动器区分「有 Host」与「什么都没有」。其余路由都要 `Authorization: Bearer <token>`（数据根 `<data root>/host/serve-token`，进程拿到端口后写一次、0600），带 `Origin` 或 `Host` 不是本端口回环的请求一律 403。

| 路由                                                   | 回答                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `GET /status`                                          | 公开相位（不含登录 URL）                                                  |
| `GET /connection`                                      | dsh 登录 URL，只在 ready 时给                                             |
| `GET /watch`                                           | WebSocket：每次变化的公开相位，以及配对列表变化时的 `bridge.devices` 事件 |
| `POST /dsh/start`                                      | `{"source":"attach"\|"userStart"}` → 相位                                 |
| `POST /dsh/stop`、`POST /dsh/restart`                  | 相位                                                                      |
| `GET /registration`                                    | Host 的登记快照：`version`、`phase`、可选 `reason`                        |
| `POST /registration/enable`、`POST /registration/stop` | 动词执行后的同一份快照                                                    |
| `POST /bridge/pairing`                                 | `{"link","expiresAt"}`；没有可用 Relay 时 409                             |
| `GET /bridge/devices`                                  | 已配对 Device，以及 Relay 链路状态                                        |
| `DELETE /bridge/devices/{deviceId}`                    | 撤销该 Device；未知则 404                                                 |

## 命令

仓库根：

```sh
cargo run --manifest-path apps/host/Cargo.toml -- serve-app   # serve-app（默认数据根）
cargo run -p dsh-bot-host -- serve-app --port 4872 --ready-stdout
cargo run -p dsh-bot-host -- serve --data-root PATH [--port N] [--official-dsh|--dsh PATH] [--patch FILE]…
cargo run -p dsh-bot-host -- service install|uninstall|status
cargo check -p dsh-bot-host
cargo test -p dsh-bot-host
```

控制 API 冒烟：`apps/host/scripts/smoke-control.mjs`（或 `.sh`）。日常 Client + Host 联调：根目录 `bun run dev`（构建 Host，App 自己启动它）。

默认端口 `4872`（`DSH_BOT_HOST_PORT`、`--port`）；默认数据根 `~/.dsh-bot`（`DSH_BOT_HOME`）。App 的启动器 spawn `dsh-bot-host serve-app`，二进制必须在 `PATH` 上（`cargo build -p dsh-bot-host` 产出在 `target/debug`）。

## Bridge

`src/bridge/` 是 Runner 侧的中继隧道：注册身份、Relay 连接、Noise、已配对 Device，以及 Bridge 转发。帧契约在 [relay-tunnel](../../docs/architecture/relay-tunnel.md)，这里不复述。`DSH_BOT_RELAY_URL` 覆盖 `src/bridge/mod.rs` 里编译进去的占位 `DEFAULT_RELAY_URL`；该占位不是真实地址，也不会被拨号。配对和设备列表走上面的 `/bridge/*`。`/watch` 在列表变化时另发 `{"event":"bridge.devices","devices":[...]}`。

Bridge 转发把 Device 的一条 stream 变成对本 Host 启动的 dsh web 的回环请求：`POST /api/…` 走 HTTP，`/api/remote.mux` 走 WebSocket，其他一律以 forbidden 重置。它剥掉 Device 的 `Cookie`、`Authorization`、`Host`、`Origin` 和 `Sec-WebSocket-*`，换上自己的 Cookie，并且从不回传 `Set-Cookie`。Cookie 用 Host 登录 token 调 `/connect` 换取，按 dsh 的 origin 和 generation 缓存；遇到 401 或 dsh web 重启就重换一次。每条 stream 积压超过 1 MiB 时被当作 overloaded 重置。Bridge 始终读着回环 mux，因此自己回应 dsh 每两秒一次的 ping；Device 慢下来也不会让 mux 被断开。`src/bridge/dsh.rs` 是回环客户端与 Cookie 缓存，`http.rs` 是 HTTP stream，`ws.rs` 是 mux stream，`outbox.rs` 记积压。

## Known limitations

- Bridge 转发由假 dsh web 上的测试覆盖。端到端仍需要 Relay 和已配对 Device，所以对真 dsh web 只手工走过回环这一段：Cookie 交换、一次 `POST /api/…` 和一条 `/api/remote.mux` 连接，后者在 dsh 每两秒一次的 ping 下保持打开。
- `cargo test` 不证明签名成品上的 OS 登记：测试只快照 launchd plist、systemd 单元与 Windows `Run` 命令行，不安装任何东西。
