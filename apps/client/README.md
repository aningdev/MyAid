# @myaid/client

English | [中文](README.zh.md)

NSH desktop/mobile client in plain TSX: the entry is `App.tsx`, and there is no Rust crate here ([ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)). It owns the Workspace Shell (a flat Bot list and the Panes), the Bot registry, the official dsh protocol client and the loopback control clients. Product shape: [BLUEPRINT §产品定位](../../docs/BLUEPRINT.md), decision: [ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md). Architecture and DSH boundaries: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md). Coding guardrails: [AGENTS.md](AGENTS.md).

Bundle id: `com.aningdev.myaid` (see `nsh.json`). The tree keeps its `nsh init` shape ([project structure](https://nsh.dev/docs/project-structure.md)).

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── shell/                  # Navigator (flat Bot list), Panes, settings overlay, commands, prefs, attention
│   └── ui/                     # styled foundation (the only wrapper of nsh/base)
├── features/                   # bots (registry, Pane, details), dialogue (chat, segments), workspace, settings
├── lib/                        # dsh, host, relay, background
├── screens/                    # open(…) entries, screenshots, opt-in real-Host smokes
├── nsh.json                    # plain TSX: no "rust" key
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
- Real-Host smokes are opt-in: `screens/*.smoke.test.tsx` returns unless `MYAID_SMOKE_HOST` is set, and that is also the only way a test app reaches the local control plane (an app opened by `test/open.ts` never probes or spawns). See [screens/README.md](screens/README.md).
- Tests that open the app use [`test/open.ts`](test/open.ts): its host parameter makes the registry and shell prefs use the test app's isolated storage, never the real `~/.myaid`.

## Shell

- **Navigator**: collapsible left `ResizablePanel` (232 default, 160–480) under the hidden title bar's drag region: a search field (`⌘F`), the **Pin** group, the rest of the Bots by recent activity (a Bot's Workspaces and Sessions; a working dot, an unread count, a waiting-approval dot), the **New Bot** row (`⌘N`) and, in the footer, the Host's state plus **⚙ Settings** (`⌘,`). No domain sections, no trees, no Session rows. A row's secondary click offers Pin / Bot details / Rename / Archive; an archived Bot leaves the list, and a search still finds it with **Unarchive**.
- **Panes**: `nsh/base` DockArea (center). A Pane shows one Bot's conversation; a press opens the active Pane on it, a drag to the right drops it into a new Pane beside the active one, and a Bot that already has a Pane only moves the focus. Split (right / down), resize, zoom, close and the focus shortcuts come from the DockArea and the command table. The layout, each Pane's Bot and the active Pane are restored from client prefs; a Bot that is gone leaves its Pane empty. No tabs.
- **Pane header**: the Bot's mark (breathing while it works), its name, then **Bot details** beside split / zoom / close. The old per-Pane Inspector and its `⌥⌘I` are gone.
- **Bot details** (`features/bots/BotDetails.tsx`): one modal over the Pane — Profile / Runs with / Skills / Plugins, the current segment's working directory, model, usage / context and dsh's **Compact**, and Delete / Archive. Profile and Runs with write registry preferences; Skills and Plugins read the Bot's preset composition and derive its own preset when the preset writer is available, else say why they cannot save.
- **Settings**: a whole-page overlay over the Panes (the Panes keep their layout, scroll and drafts underneath). Back or Escape returns. Today it holds the Background Services control; the model-provider / general / about groups land in L3.
- **Conversation (until L2)**: a Bot's Pane shows its most recent Session — the one dsh last updated, else the newest claim of its most active dialogue — and follows a new one as soon as it is claimed. A Bot with no conversation offers to start one in its default working directory. The Bot's one long conversation (segments, history rail, `/new`) lands in L2.
- **Runtime ownership**: the official React-free Client models own dsh state (`ctx.sessions`: list, event window, follow, paging, prompt / queue / cancel, projections; `ctx.workspaces`: rows, order, archive, pins). `SessionController` keeps only what the product adds — draft, attachments, approval presentation, the local turn (`TurnProjection`) and the Pane's view. Two Panes on two Sessions stream at once (across Workspaces).

| Shortcut     | Action                             |
| ------------ | ---------------------------------- |
| `⌘N`         | New Bot                            |
| `⌘,`         | Settings                           |
| `⌘K`         | Command palette                    |
| `⌘F`         | Search the Bot list                |
| `⌘B`         | Collapse / expand the Navigator    |
| `⌘\` / `⌘⇧\` | Split the active Pane right / down |
| `⌘[` / `⌘]`  | Previous / next Pane               |
| `⌘W`         | Close the Pane                     |
| `⌘.`         | Stop the running turn              |
| `⌘L`         | Focus the composer                 |

`components/shell/commands.ts` is the one command table behind the keyboard, the application menu and the palette. `components/shell/attention.ts` turns a finished reply or a new approval in an unwatched Session into a system notification (the Bot's name) and a Dock badge; pressing it opens that Bot's Pane.

## Data

- Registry: `~/.myaid/registry/bots.json` on desktop; `nsh` Storage (`myaid.registry.bots`) on web / mobile. Version 5 holds templates, Bots (`archived` is an optional field) and — until L2 — Dialogues (`botId` + `workspaceId`) with claimed Sessions. A v3 / v4 file is read-only until a Host is connected: the migration hands each Dialogue's path, name and archived claims to a dsh Workspace (`bots.json.v4.bak` keeps the old file). Identity and the archive flag stay registry data ([ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md)); Workspace paths, titles and Session order are dsh's ([ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md)).
- Workspaces and Sessions: the official `ClientWorkspaceModel` / `ClientSessions` are installed on the Connection's Cordis context (`lib/dsh/connection.ts`), so each Host generation replaces their snapshots atomically. `features/workspace` and `features/dialogue/session` only project those snapshots into NSH signals; Remote responses never write that state. Their browser `__ModuleLoader__` bundles are unwrapped into static ESM by `prepare:sdk` (`lib/dsh/generated/`), because NSH refuses code from strings.
- Client prefs: `~/.myaid/prefs/client.json` on desktop; Storage (`myaid.prefs.shell`) elsewhere. Version 2 covers the Navigator's width and open state, the pinned Bot ids and the Panes (layout, each Pane's Bot, the active one). A version 1 file is read once: Bot pins are kept, a Dialogue or Session pin becomes the Pane of the Bot it belonged to, and the Session pins themselves are dropped. The chat's send-key preference is a small Storage key of its own (`myaid.prefs.sendKey`).
- `capabilities.fs` grants read/write only `${homeDir}/.myaid`. Attachments come from the system picker; a drop or paste outside the grant falls back to the same picker — see [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md).

## Known limitations

- Narrow windows show the mobile notice; the desktop shell starts at 700 pt (desktop idiom) / 900 pt (others).
- A Bot's Pane shows its most recent Session until the long conversation lands (L2); there is no history rail, no segment divider and no `/new` yet.
- The shell's copy is still mixed Chinese / English; the bilingual pass is L4, and Settings holds only Background Services until L3.
- Bot details cannot save Skills / Plugins changes when the Host does not mount `myaid-plugin-bot-presets`: no other Remote writes an Agent preset body. See the gaps table in [ARCHITECTURE §4](../../docs/ARCHITECTURE.md).
- The dsh mux can drop a peer that misses two heartbeats while the client is blocked; the Session controller re-follows (3 tries, backoff). Details in [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md).

## Native layer: the Host this app starts (desktop only)

There is no Rust in this app ([ADR 0007](../../docs/adr/0007-native-layer-after-lorca.md)). The Host is loopback HTTP + one WebSocket on `127.0.0.1:4872` (`MYAID_HOST_PORT`), authenticated by `<data root>/host/serve-token`; the Relay has its own at `127.0.0.1:8787` with `relay/serve-token`.

- `lib/host/launcher.ts` starts the Host when none answers (`myaid-host serve-app`), reuses one that does, and starts it again after an exit (1 s doubling to 15 s). It needs `myaid-host` on `PATH`; `cargo build -p myaid-host` puts it in `target/debug`, and `scripts/run-with-host-path.mjs` puts that folder first for `dev` / `dev:macos`. Prefer repo-root `bun run dev`, which builds the Host first.
- `lib/host/client.ts` is the transport (`fetch` + standard `WebSocket`); `lib/host/control.ts` is the product surface (`ensureBackendReady`, `resolveDshLoginUrl`, `watchHostStatus`).
- The sidebar footer is the Host empty state when the launcher cannot run one: its reason plus the manual `myaid-host serve-app`.
- `dev:ios` / `dev:android` / `dev:web` / `dev:server` / `package:*` start no Host — mobile goes through the Relay, not the local Host.

## Related

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) — client structure and the dsh gaps table.
- [docs/specs/2026-11-13-bot-app.md](../../docs/specs/2026-11-13-bot-app.md) — what this round must deliver.
- [DSH_CLIENT_AUTH](../../docs/DSH_CLIENT_AUTH.md) — loopback cookie bootstrap and mux heartbeat limits.
- [ADR 0003](../../docs/adr/0003-bot-identity-is-local-registry-data.md) / [ADR 0004](../../docs/adr/0004-client-fs-limited-to-app-data.md) / [ADR 0006](../../docs/adr/0006-lorca-style-bot-app.md) — registry-owned identity; app-data-only `fs`; the Bot app's one long conversation and Panes.
- [screens/README.md](screens/README.md) — screenshots and opt-in real-Host smokes.
