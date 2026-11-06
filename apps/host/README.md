# myaid-host

English | [中文](README.zh.md)

Rust Host for MyAid: owns official `dsh` process lifecycle and exposes **HostControl** (local management, connection discovery, shared control protocol). Background registration uses the shared [`myaid-background-service`](../../crates/myaid-background-service/README.md) contract (macOS `SMAppService` facts; explicit `serve` / `serve-app` dev modes do not register with the OS).

Constraints: [AGENTS.md](AGENTS.md). Read [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md), [BLUEPRINT](../../docs/BLUEPRINT.md).

## Commands

From the repo root:

```sh
bun run host:dev          # cargo run --manifest-path apps/host/Cargo.toml -- serve-app
cargo run -p myaid-host -- serve-app
cargo run -p myaid-host -- serve --data-root PATH [--official-dsh|--dsh PATH] …
cargo check -p myaid-host
cargo test -p myaid-host
```

Smoke the control endpoint: `apps/host/scripts/smoke-control.sh` (Unix) or `bun apps/host/scripts/smoke-control.mjs`.

Default control endpoints: Unix `~/.myaid/host/control.sock`, Windows `\\.\pipe\myaid-host` (`MYAID_HOST_SOCKET` overrides). Day-to-day Client+Host bring-up: root `bun run dev`.

## Known limitations

- Windows covers the Host control channel for bring-up; finished `SMAppService`-style registration and NSH Windows desktop UI are out of scope.
- `cargo test` / ad-hoc packages do not prove signed-product `SMAppService` register / approve / unregister.
