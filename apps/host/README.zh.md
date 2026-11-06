# myaid-host

[English](README.md) | 中文

MyAid 的 Rust 宿主：独占官方 `dsh` 进程生命周期，并暴露 **HostControl**（本机管理、连接发现、共享控制协议）。后台登记走共享 [`myaid-background-service`](../../crates/myaid-background-service/README.zh.md) 契约（macOS `SMAppService` 事实；开发态显式 `serve` / `serve-app` 不触发 OS 登记）。

约束：[AGENTS.md](AGENTS.md)。请读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md)、[BLUEPRINT](../../docs/BLUEPRINT.md)。

## 命令

仓库根：

```sh
bun run host:dev          # cargo run --manifest-path apps/host/Cargo.toml -- serve-app
cargo run -p myaid-host -- serve-app
cargo run -p myaid-host -- serve --data-root PATH [--official-dsh|--dsh PATH] …
cargo check -p myaid-host
cargo test -p myaid-host
```

控制端点冒烟：`apps/host/scripts/smoke-control.sh`（Unix）或 `bun apps/host/scripts/smoke-control.mjs`。

默认控制端点：Unix `~/.myaid/host/control.sock`，Windows `\\.\pipe\myaid-host`（可用 `MYAID_HOST_SOCKET` 覆盖）。日常 Client+Host 联调：根目录 `bun run dev`。

## Known limitations

- Windows 本期保证 Host 控制通道联调；成品级后台登记与 NSH Windows 桌面窗体不在范围。
- `cargo test` / ad-hoc 包不能替代签名成品上的 `SMAppService` 注册 / 批准 / 注销验收。
