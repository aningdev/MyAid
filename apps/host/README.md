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
| `POST /bridge/pairing`                                 | `{"link","expiresAt"}`, or 409 when the Relay address is unusable                                  |
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

`DSH_BOT_RELAY_URL` must be an `https` (or `wss`) address; `http` and `ws` are accepted only when the host is loopback (`localhost`, `127.0.0.1`, `::1`), for a local Relay under test. Any other address is unusable: the Host does not dial it, and `POST /bridge/pairing` answers 409 with the reason.

`src/bridge/` is the Runner side of the relay tunnel: registration identity, the Relay link, Noise, paired Devices, and bridge forwarding. The frame contract is [relay-tunnel](../../docs/architecture/relay-tunnel.md); this section does not repeat it. Unset or empty, `DSH_BOT_RELAY_URL` means the project-run Relay, `DEFAULT_RELAY_URL` in `src/bridge/mod.rs` (`https://relay.aning.dev`); set it to use your own Relay ([deploy one](../relay/README.md#deploy)). Pairing and the device list are the `/bridge/*` routes above. `/watch` also sends `{"event":"bridge.devices","devices":[...]}` when that list changes.

Bridge forwarding turns a Device stream into a loopback request against the dsh web this Host started: `POST /api/…` over HTTP, `/api/remote.mux` over a WebSocket, everything else reset as forbidden. It strips the Device's `Cookie`, `Authorization`, `Host`, `Origin` and `Sec-WebSocket-*`, sends its own Cookie, and never returns `Set-Cookie`. The Cookie comes from `/connect` with the Host login token and is cached per dsh origin and generation, so a 401 or a restarted dsh web re-exchanges it once. Each stream carries at most 1 MiB of backlog before the Bridge resets it as overloaded. The Bridge reads every loopback mux and so answers dsh's two-second pings itself, which keeps the mux alive while a Device is slow. A Device `RESET` cancels: the Bridge drops the loopback request or mux stream behind that tunnel stream and answers nothing, which is how a Device's aborted `fetch` stops dsh's work. `src/bridge/dsh.rs` holds the loopback client and the Cookie cache, `http.rs` the HTTP stream, `ws.rs` the mux stream, and `outbox.rs` the backlog accounting.

## Known limitations

- Bridge forwarding is covered by tests against a fake dsh web. An end-to-end run still needs a Relay and a paired Device, so against a real dsh web only the loopback side was walked by hand: the Cookie exchange, a `POST /api/…` and a `/api/remote.mux` socket, which stayed open across dsh's two-second pings.
- Signed-product OS registration is not proven by `cargo test`: the tests snapshot the launchd plist, the systemd unit and the Windows `Run` command without installing anything.
