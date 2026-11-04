# @myaid/client

NSH **mixed** app: TSX entry (`App.tsx`) plus a Rust crate at this directory (`Cargo.toml`, `src/lib.rs`;
`nsh.json` `"rust": "."`). Layout matches `nsh init --template mixed`
([project structure](https://nsh.dev/docs/project-structure.md), [CLI](https://nsh.dev/docs/cli.md)).

```text
apps/client/
├── App.tsx / App.test.tsx   # TSX entry + nsh test
├── nsh.json                 # "rust": "."
├── Cargo.toml / src/lib.rs  # #[native_module("myaid/native")]
├── components/              # optional TSX modules
└── assets/                  # images / fonts when needed
```

```sh
bun run --cwd apps/client check
bun run --cwd apps/client dev
bun run --cwd apps/client test
```
