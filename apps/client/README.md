# @myaid/client

English | [中文](README.zh.md)

NSH **mixed** desktop/mobile client: TSX entry (`App.tsx`) plus a Rust crate in this directory (`Cargo.toml`, `src/lib.rs`; `nsh.json` `"rust": "."`). Layout matches `nsh init --template mixed` ([project structure](https://nsh.dev/docs/project-structure.md), [CLI](https://nsh.dev/docs/cli.md), [packaging](https://nsh.dev/docs/packaging.md)).

Bundle id: `com.aningdev.myaid` (see `nsh.json`). Constraints: [AGENTS.md](AGENTS.md). Architecture / DSH: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md).

```text
apps/client/
├── App.tsx / App.test.tsx
├── nsh.json                 # "rust": "."
├── Cargo.toml / src/        # myaid/native — shell demo + CookieWebSocket
├── lib/dsh/                 # Cookie auth + AuthenticatedSocket
├── components/ / features/ / workspace/
└── assets/
```

## Commands

From the repo root with `vp run` (do not use `bun --cwd`):

```sh
vp run @myaid/client#check
vp run @myaid/client#dev              # = dev:macos
vp run @myaid/client#dev:macos
vp run @myaid/client#dev:web
vp run @myaid/client#dev:ios
vp run @myaid/client#dev:android
vp run @myaid/client#dev:server       # nsh dev --server-only
vp run @myaid/client#test
vp run @myaid/client#build            # bytecode (nsh build)
vp run @myaid/client#package:macos    # .nsh/out/MyAid.app
vp run @myaid/client#package:web
```

- Day-to-day UI: `nsh run --target …` via the `dev*` scripts above.
- Service only (attach your own simulator/host): `dev:server`.
- `package:macos` produces an NSH-installable `.app`, **not** the finished App + Host + `SMAppService` product.

## Host socket (local desktop only)

Prefer repo-root `bun run dev`: ensure Host, then start this package's `dev`.  
`MYAID_HOST_SOCKET` is injected by root `scripts/dev.mjs` and this package's `dev` / `dev:macos` (via `scripts/run-with-host-socket.mjs`); Unix default `~/.myaid/host/control.sock`, Windows `\\.\pipe\myaid-host`.  
`dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` do **not** inject — mobile goes through Relay, not the local Host control channel.

Local dsh auth (NSH 0.4 still needs CookieWebSocket): [docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md).
