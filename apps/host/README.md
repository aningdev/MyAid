# myaid-host

English | [中文](README.zh.md)

Rust Host for MyAid, shaped after lorca's `lorca serve`: it owns the official `dsh` process lifecycle and serves a loopback control API on `127.0.0.1:4872` — the same one the Client starts, probes and watches. OS registration is this unit's own `service` module (launchd / systemd / Windows `Run` key), with the shared launch plan in [`myaid-service`](../../crates/myaid-service/README.md).

Constraints: [AGENTS.md](AGENTS.md). Read [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0006](../../docs/decisions/0006-host-is-the-only-background-service.md), [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md).

## Control API

`GET /` answers `myaid` with no token, so a launcher can tell a Host from anything else. Everything else takes `Authorization: Bearer <token>`, the token in `<data root>/host/serve-token` (made once, mode 0600), and refuses a request that carries an `Origin` or names another host with 403.

| Route                                                  | Answers                                            |
| ------------------------------------------------------ | -------------------------------------------------- |
| `GET /status`                                          | public lifecycle status (no login URL)             |
| `GET /connection`                                      | the dsh login URL, only while ready                |
| `GET /watch`                                           | a WebSocket that pushes each changed public status |
| `POST /dsh/start`                                      | `{"source":"attach"\|"userStart"}` → status        |
| `POST /dsh/stop`, `POST /dsh/restart`                  | status                                             |
| `GET /registration`                                    | this unit's registration fact                      |
| `POST /registration/enable`, `POST /registration/stop` | this unit's registration verb                      |

## Commands

From the repo root:

```sh
cargo run --manifest-path apps/host/Cargo.toml -- serve-app   # serve-app at the default data root
cargo run -p myaid-host -- serve-app --port 4872 --ready-stdout
cargo run -p myaid-host -- serve --data-root PATH [--port N] [--official-dsh|--dsh PATH] [--patch FILE]…
cargo run -p myaid-host -- service install|uninstall|status
cargo check -p myaid-host
cargo test -p myaid-host
```

Smoke the control API: `apps/host/scripts/smoke-control.mjs` (or `.sh`). Day-to-day Client + Host bring-up: root `bun run dev`, which builds the Host and lets the app start it.

Default port `4872` (`MYAID_HOST_PORT`, `--port`); default data root `~/.myaid` (`MYAID_DATA_ROOT`). The App's launcher spawns `myaid-host serve-app`, so the binary has to resolve on `PATH` (`cargo build -p myaid-host` puts it in `target/debug`).

## Known limitations

- Signed-product OS registration is not proven by `cargo test`: the tests snapshot the launchd plist, the systemd unit and the Windows `Run` command without installing anything.
- The control API carries no multi-device traffic yet; `bridge` is an empty module.
