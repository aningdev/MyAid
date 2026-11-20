# dsh-bot-relay

English | [中文](README.zh.md)

Public zero-knowledge Relay. It will meet Devices for Pairing and forward ciphertext frames without decrypting them. Pairing and forwarding are not implemented; this process only serves `GET /` (`dsh-bot-relay`) and `GET /v1/health` (service, version, protocol, uptime).

It is not a Background Service: no OS registration on any Device, no data root, and no `DSH_BOT_HOME`. It does not hold Owner credentials or replace the Host's Bridge.

Constraints: [AGENTS.md](AGENTS.md). Read [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md), [0006](../../docs/decisions/0006-host-is-the-only-background-service.md).

## Commands

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
```

`--bind` is an IP address, default `127.0.0.1`. `--port` defaults to `8787`. Log level is `RUST_LOG`.

## Known limitations

- Pairing, identity keys and encrypted forwarding are not built, and there is no store.
- Nothing here registers with launchd, systemd, or the Windows `Run` key.
