# dsh-bot-host

English | [中文](README.zh.md)

Rust Host for dsh-bot, shaped after lorca's `lorca serve`: it owns the official `dsh` process lifecycle and serves a loopback control API on `127.0.0.1:4872` — the same one the Client starts, probes and watches. OS registration lives in this unit's `service` module (`src/service/`: launchd, systemd, and the Windows `Run` key). The registration snapshot names only the Host.

Constraints: [AGENTS.md](AGENTS.md). Read [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0006](../../docs/decisions/0006-host-is-the-only-background-service.md), [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md).

## Control API

`GET /` answers `dsh-bot` with no token, so a launcher can tell a Host from anything else. Everything else takes `Authorization: Bearer <token>`, the token in `<data root>/host/serve-token` (made once, mode 0600), and refuses a request that carries an `Origin` or names another host with 403.

| Route                                                  | Answers                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `GET /status`                                          | public lifecycle status (no login URL)                                                             |
| `GET /connection`                                      | the dsh login URL, only while ready                                                                |
| `GET /watch`                                           | a WebSocket: each changed public status, and a `bridge.devices` event when the paired list changes |
| `POST /dsh/start`                                      | `{"source":"attach"\|"userStart"}` → status                                                        |
| `POST /dsh/stop`, `POST /dsh/restart`                  | status                                                                                             |
| `GET /registration`                                    | Host snapshot: `version`, `phase`, optional `reason`                                               |
| `POST /registration/enable`, `POST /registration/stop` | the same snapshot after the verb                                                                   |
| `POST /bridge/pairing`                                 | `{"link","expiresAt"}`, or 409 when no Relay is configured                                         |
| `GET /bridge/devices`                                  | paired Devices and the Relay link                                                                  |
| `DELETE /bridge/devices/{deviceId}`                    | revoke that Device; 404 when it is unknown                                                         |

## Commands

From the repo root:

```sh
cargo run --manifest-path apps/host/Cargo.toml -- serve-app   # serve-app at the default data root
cargo run -p dsh-bot-host -- serve-app --port 4872 --ready-stdout
cargo run -p dsh-bot-host -- serve --data-root PATH [--port N] [--official-dsh|--dsh PATH] [--patch FILE]…
cargo run -p dsh-bot-host -- service install|uninstall|status
cargo check -p dsh-bot-host
cargo test -p dsh-bot-host
```

Smoke the control API: `apps/host/scripts/smoke-control.mjs` (or `.sh`). Day-to-day Client + Host bring-up: root `bun run dev`, which builds the Host and lets the app start it.

Default port `4872` (`DSH_BOT_HOST_PORT`, `--port`); default data root `~/.dsh-bot` (`DSH_BOT_HOME`). The App's launcher spawns `dsh-bot-host serve-app`, so the binary has to resolve on `PATH` (`cargo build -p dsh-bot-host` puts it in `target/debug`).

## Bridge

`src/bridge/` is the Runner side of the relay tunnel: registration identity, the Relay link, Noise, and paired Devices. The frame contract is [relay-tunnel](../../docs/architecture/relay-tunnel.md). `DSH_BOT_RELAY_URL` overrides the compiled placeholder `DEFAULT_RELAY_URL` in `src/bridge/mod.rs`; that placeholder is not a real address and is not dialed. Pairing and the device list are the `/bridge/*` routes above. `/watch` also sends `{"event":"bridge.devices","devices":[...]}` when that list changes. Stream 0 answers a ping; other streams are refused. This module does not forward Device traffic to dsh web.

## Known limitations

- Signed-product OS registration is not proven by `cargo test`: the tests snapshot the launchd plist, the systemd unit and the Windows `Run` command without installing anything.
