# @myaid/client

NSH **mixed** app: TSX entry (`App.tsx`) plus a Rust crate at this directory (`Cargo.toml`, `src/lib.rs`;
`nsh.json` `"rust": "."`). Layout matches `nsh init --template mixed`
([project structure](https://nsh.dev/docs/project-structure.md), [CLI](https://nsh.dev/docs/cli.md),
[packaging](https://nsh.dev/docs/packaging.md)).

Bundle id: `com.aningdev.myaid`（见 `nsh.json`）。

```text
apps/client/
├── App.tsx / App.test.tsx
├── nsh.json                 # "rust": "."
├── Cargo.toml / src/        # myaid/native — shell demo + CookieWebSocket
├── lib/dsh/                 # Cookie auth + AuthenticatedSocket
├── components/ / features/ / workspace/
└── assets/
```

## 命令

根目录用 `vp run`（勿用 `bun --cwd`）：

```sh
vp run @myaid/client#check
vp run @myaid/client#dev              # = dev:macos
vp run @myaid/client#dev:macos
vp run @myaid/client#dev:web
vp run @myaid/client#dev:ios
vp run @myaid/client#dev:android
vp run @myaid/client#dev:server       # nsh dev --server-only
vp run @myaid/client#test
vp run @myaid/client#build            # bytecode（nsh build）
vp run @myaid/client#package:macos    # .nsh/out/MyAid.app
vp run @myaid/client#package:web
```

- 日常改 UI：`nsh run --target …`（`dev` / `dev:macos` / `dev:web` …）。
- 只起服务、自己连模拟器或已开宿主：`dev:server`。
- `package:macos` 产出 NSH 可安装 `.app`，**不是**根级成品（App + Host + `SMAppService` 组装另议）。

## Host socket（仅本机桌面）

`MYAID_HOST_SOCKET` 只由 `dev` / `dev:macos` 注入（默认 `~/.myaid/host/control.sock`，可覆盖）。  
`dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` **不注入**——移动端经 Relay，不走本机 Host 控制通道。

dsh 本机认证（NSH 0.4 仍需 CookieWebSocket）：见 [docs/DSH_CLIENT_AUTH.md](../../docs/DSH_CLIENT_AUTH.md)。
