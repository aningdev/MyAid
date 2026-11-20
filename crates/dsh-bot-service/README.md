# dsh-bot-service

English | [中文](README.zh.md)

The launch plan and registration vocabulary shared by the Host and the Relay, after lorca's `crates/cli/src/service.rs`. `Unit` names one unit (launchd label, systemd unit, arguments, log); `launchd_plist`, `systemd_unit` and `windows_run_command` build the exact text an install would write, so a test snapshots it without touching launchd, systemd or the registry. `registration.rs` holds the wire shapes the Client merges (`unit`, `phase`, snapshot, availability).

Consumers: [`apps/host`](../../apps/host/README.md), [`apps/relay`](../../apps/relay/README.md). Why one shared module: [0006](../../docs/decisions/0006-host-is-the-only-background-service.md).

## Commands

```sh
cargo check -p dsh-bot-service
cargo test -p dsh-bot-service
```

## Layout

- `src/service.rs` — `Unit`, the plist / unit / Run command builders, `install`/`uninstall`/`status`, the Windows `service run` supervisor
- `src/registration.rs` — phases, snapshot, availability
