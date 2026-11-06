# myaid-background-service

English | [中文](README.zh.md)

Shared **Background Service** OS registration contract used by Host and Relay in parallel. Platform adapters report facts; `HostControl` and `RelayControl` expose the same verbs (`ServiceUnit`, registration phase / snapshot / operations).

Consumers: [`apps/host`](../../apps/host/README.md), [`apps/relay`](../../apps/relay/README.md). Architecture / Host–Relay boundary: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md).

## Commands

```sh
cargo check -p myaid-background-service
cargo test -p myaid-background-service
```

## Layout

- `src/lib.rs` — public re-exports
- `src/registration.rs` — contract types (`CONTRACT_VERSION`, units, phases, snapshots)

No standalone binary; linked into Host and Relay.
