# myaid-relay

English | [中文](README.zh.md)

The resident Relay process, laid out after lorca's `crates/relay`: `config.rs` (paths, port, logging), `routes.rs` (the local control API), `run.rs` (bind, token, graceful stop) and `service.rs` (this unit's OS registration). `GET /` answers `myaid-relay` and `GET /v1/health` answers the version and protocol, both without a token; `/registration*` takes the data root's `relay/serve-token`.

Encrypted frame forwarding, identity keys and pairing are **not built yet**: mobile is not in this round, and the shape follows lorca when it starts ([0006](../../docs/decisions/0006-host-is-the-only-background-service.md)). It never decrypts payloads, holds owner credentials, or replaces Host Bridge authorization.

Constraints: [AGENTS.md](AGENTS.md). Architecture §7 / Bridge–Relay: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md). Shared launch plan: [`myaid-service`](../../crates/myaid-service/README.md).

## Commands

```sh
cargo run -p myaid-relay -- serve-app --port 8787
cargo run -p myaid-relay -- serve --data-root PATH [--port N]
cargo run -p myaid-relay -- service install|uninstall|status
cargo check -p myaid-relay
cargo test -p myaid-relay
```

Default port `8787` (`MYAID_RELAY_PORT`), data root `~/.myaid` (`MYAID_DATA_ROOT`), log level `RUST_LOG`.

## Known limitations

- No store, no identity, no pairing and no forwarding yet; there is deliberately no database until forwarding starts.
- OS registration is snapshotted in tests and never installed by them.
