# myaid-host

[English](README.md) | 中文

MyAid 的 Rust 宿主，照 lorca 的 `lorca serve` 成形：独占官方 `dsh` 进程生命周期，并在 `127.0.0.1:4872` 提供回环控制 API——Client 自己启动它、探活它、订阅它。OS 登记归本单元的 `service` 模块（launchd / systemd / Windows `Run` 键），共用的启动计划在 [`myaid-service`](../../crates/myaid-service/README.zh.md)。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)。

## 控制 API

`GET /` 无需 token，回 `myaid`，让启动器区分「有 Host」与「什么都没有」。其余路由都要 `Authorization: Bearer <token>`（数据根 `<data root>/host/serve-token`，进程拿到端口后写一次、0600），带 `Origin` 或 `Host` 不是本端口回环的请求一律 403。

| 路由                                                   | 回答                                      |
| ------------------------------------------------------ | ----------------------------------------- |
| `GET /status`                                          | 公开相位（不含登录 URL）                  |
| `GET /connection`                                      | dsh 登录 URL，只在 ready 时给             |
| `GET /watch`                                           | WebSocket，推送每次变化的公开相位         |
| `POST /dsh/start`                                      | `{"source":"attach"\|"userStart"}` → 相位 |
| `POST /dsh/stop`、`POST /dsh/restart`                  | 相位                                      |
| `GET /registration`                                    | 本单元的登记事实                          |
| `POST /registration/enable`、`POST /registration/stop` | 本单元的登记动词                          |

## 命令

仓库根：

```sh
bun run host:dev                                             # serve-app（~/.myaid）
cargo run -p myaid-host -- serve-app --port 4872 --ready-stdout
cargo run -p myaid-host -- serve --data-root PATH [--port N] [--official-dsh|--dsh PATH] [--patch FILE]…
cargo run -p myaid-host -- service install|uninstall|status
cargo check -p myaid-host
cargo test -p myaid-host
```

控制 API 冒烟：`apps/host/scripts/smoke-control.mjs`（或 `.sh`）。日常 Client + Host 联调：根目录 `bun run dev`（构建 Host，App 自己启动它）。

默认端口 `4872`（`MYAID_HOST_PORT`、`--port`）；默认数据根 `~/.myaid`（`MYAID_DATA_ROOT`）。App 的启动器 spawn `myaid-host serve-app`，二进制必须在 `PATH` 上（`cargo build -p myaid-host` 产出在 `target/debug`）。

## Known limitations

- `cargo test` 不证明签名成品上的 OS 登记：测试只快照 launchd plist、systemd 单元与 Windows `Run` 命令行，不安装任何东西。
- 控制面还不承载多端流量；`bridge` 仍是空模块。
