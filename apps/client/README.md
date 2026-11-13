# @myaid/client

English | [中文](README.zh.md)

NSH **mixed** desktop/mobile client: TSX entry (`App.tsx`) plus a Rust crate in this directory (`Cargo.toml`, `src/lib.rs`; `nsh.json` `"rust": "."`). It owns the Workspace Shell, the Bot registry and the official dsh protocol client. Architecture and DSH boundaries: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md). Coding guardrails: [AGENTS.md](AGENTS.md).

Bundle id: `com.aningdev.myaid` (see `nsh.json`). Layout matches `nsh init --template mixed` ([project structure](https://nsh.dev/docs/project-structure.md)).

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── shell/                  # Navigator, Workbench, Panels, commands, prefs, attention
│   └── ui/                     # styled foundation (the only wrapper of nsh/base)
├── features/                   # bots, dialogue, inspector, settings
├── lib/                        # dsh, host, relay, background
├── screens/                    # open(…) entries, screenshots, opt-in real-Host smokes
├── nsh.json                    # "rust": "."
├── Cargo.toml / src/           # myaid/native — HostControl / RelayControl
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
- Real-Host smokes are opt-in: `screens/*.smoke.test.tsx` returns unless `MYAID_SMOKE_HOST_SOCKET` is set. See [screens/README.md](screens/README.md).
- Tests that open the app use [`test/open.ts`](test/open.ts): its host parameter makes the registry and shell prefs use the test app's isolated storage, never the real `~/.myaid`.

## Shell

- **Navigator**: collapsible left `ResizablePanel` (232 default, 160–480). Its top row is the hidden title bar's drag region; below it are the filter field (`⌘F`) and an `nsh/base` Tree. Depth-0 rows are sections (Favorites, Mail, Task, Knowledge, Bots, Dialogues, Spaces, Settings); a leaf press opens its Nav address in the active Panel, and a context menu offers the object's verbs. Bots and Dialogues come from the registry; Favorites are pinned addresses; Settings' leaf opens Background Services. Mail / Task / Knowledge / Spaces stay parked fixtures.
- **Workbench**: `nsh/base` DockArea (center) whose Panels can split, zoom, resize, move and close. The layout, each Panel's Nav address, the active Panel and the Navigator's width / folded sections are restored from client prefs; an address whose object is gone resolves to an empty Panel.
- **Panels**: `session` → `SessionPanel` → `ChatPane` (header, transcript, approval, composer) with an optional **Inspector**; `dialogue` → `DialoguePanel`; `bot` → `BotPanel`; `setting` → Background Services. An empty Panel shows the welcome state until the first Bot exists.
- **Runtime ownership**: `SessionController` holds a Session's follow stream, draft, attachments and approval queue. Two Panels on one Session share it; two Sessions can stream at once. Navigator rows show working / unread / waiting-for-approval dots.
- **New Bot**: one sheet (`features/bots/NewBotSheet.tsx`) for the Bots section's `+`, `⇧⌘N`, the welcome page and the palette. It saves the Bot without a Host; its first Dialogue needs one, because a Dialogue opens on a dsh Workspace (`workspace.create`) and its first Session is a `session.create({ workspaceId })`.
- **Inspector**: Session Panel's right rail (268–320), toggled per Panel by `⌥⌘I`. Bot / Dialogue / Sessions / Deliverables / Usage; Compact runs `/compact`; the workspace path reveals in Finder when the Host allows it.
- **Bot Settings**: one sheet with Profile / Runs with / Skills / Plugins. Profile and Runs with write registry preferences; Skills and Plugins read the Bot's preset composition. A capability change derives the Bot's own preset when the preset writer is available; otherwise it says why it cannot save.

| Shortcut     | Action                              |
| ------------ | ----------------------------------- |
| `⌘N`         | New Session                         |
| `⇧⌘N`        | New Bot                             |
| `⌘K`         | Command palette                     |
| `⌘F`         | Filter the Navigator                |
| `⌘B`         | Collapse / expand the Navigator     |
| `⌥⌘I`        | Toggle the Inspector                |
| `⌘\` / `⌘⇧\` | Split the active Panel right / down |
| `⌘[` / `⌘]`  | Previous / next Panel               |
| `⌘W`         | Close the Panel                     |
| `⌘.`         | Stop the running turn               |
| `⌘L`         | Focus the composer                  |
| `⌘1…⌘8`      | Reveal Navigator section N          |

`components/shell/commands.ts` is the one command table behind the keyboard, the application menu and the palette. `components/shell/attention.ts` turns a finished reply or a new approval in an unwatched Session into a system notification and a Dock badge.

## Data

- Registry: `~/.myaid/registry/bots.json` on desktop; `nsh` Storage (`myaid.registry.bots`) on web / mobile. Version 5 holds templates, Bots and Dialogues (`botId` + `workspaceId`). A v3 / v4 file is read-only until a Host is connected: the migration hands each Dialogue's path, name and archived claims to a dsh Workspace (`bots.json.v4.bak` keeps the old file). Identity stays registry data ([ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md)); the Dialogue's name, Session order, pins and archive are dsh's Workspace ([ADR 0005](../../docs/adr/0005-dialogue-on-dsh-workspace.md)).
- Workspaces: `features/workspace` projects `workspace.follow` into signals. The official `ClientWorkspaceModel` only ships a browser `window.__ModuleLoader__` entry (no `node` condition, and it imports an unpublished `dsh-client-store`), so NSH consumes the Remote's frames and results directly.
- Client prefs: `~/.myaid/prefs/client.json` on desktop; Storage (`myaid.prefs.shell`) elsewhere. They cover the Navigator, Workbench and Favorites. The chat's send-key preference is a small Storage key of its own (`myaid.prefs.sendKey`).
- `capabilities.fs` grants read/write only `${homeDir}/.myaid`. Attachments come from the system picker; a drop or paste outside the grant falls back to the same picker — see [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md).

## Known limitations

- Narrow windows show the mobile notice; the desktop shell starts at 700 pt (desktop idiom) / 900 pt (others).
- Bot Settings cannot save Skills / Plugins changes: no Remote writes an Agent preset body. See the gaps table in [ARCHITECTURE §4](../../docs/ARCHITECTURE.md).
- The dsh mux can drop a peer that misses two heartbeats while the client is blocked; the Session controller re-follows (3 tries, backoff). Details in [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md).

## Host socket (local desktop only)

Prefer repo-root `bun run dev`: ensure Host, then start this package's `dev`.  
`MYAID_HOST_SOCKET` is injected by root `scripts/dev.mjs` and this package's `dev` / `dev:macos` (via `scripts/run-with-host-socket.mjs`); Unix default `~/.myaid/host/control.sock`, Windows `\\.\pipe\myaid-host`.  
`dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` do **not** inject — mobile goes through Relay, not the local Host control channel.

## Related

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) — client structure and the dsh gaps table.
- [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md) — loopback cookie bootstrap and mux heartbeat limits.
- [ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md) / [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md) — registry-owned identity; app-data-only `fs`.
- [screens/README.md](screens/README.md) — screenshots and opt-in real-Host smokes.
