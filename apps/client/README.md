# @myaid/client

NSH **mixed** app: TSX entry (`App.tsx`) plus a Rust crate at this directory (`Cargo.toml`, `src/lib.rs`;
`nsh.json` `"rust": "."`). Layout matches `nsh init --template mixed`
([project structure](https://nsh.dev/docs/project-structure.md), [CLI](https://nsh.dev/docs/cli.md)).

```text
apps/client/
├── App.tsx / App.test.tsx
├── nsh.json                 # "rust": "."
├── Cargo.toml / src/        # myaid/native — shell demo + CookieWebSocket
├── lib/dsh/                 # Cookie auth + AuthenticatedSocket
├── components/ / features/ / workspace/
└── assets/
```

```sh
bun run --cwd apps/client check
bun run --cwd apps/client dev
bun run --cwd apps/client test
```

dsh 本机认证（NSH 0.4 仍需 CookieWebSocket）：见 [docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。
