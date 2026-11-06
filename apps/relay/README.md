# myaid-relay

English | [中文](README.zh.md)

Multi-device **ciphertext frame** relay shell. **RelayControl** exposes local readiness and Relay-unit Background Service registration (macOS `SMAppService` facts; explicit `serve` does not register). Device connection routing and bounded delivery queues are not implemented yet.

Constraints: [AGENTS.md](AGENTS.md). Architecture §7 / Bridge–Relay: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md). Shared registration contract: [`myaid-background-service`](../../crates/myaid-background-service/README.md).

## Commands

```sh
cargo run -p myaid-relay
cargo check -p myaid-relay
cargo test -p myaid-relay
```

## Known limitations

- End-to-end device routing and bounded delivery queues are still shells.
- Does not decrypt payloads, hold owner credentials, or replace Host Bridge authorization.
