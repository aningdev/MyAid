# @dsh-bot/client

English | [中文](README.zh.md)

NSH desktop/mobile client in plain TSX: the entry is `App.tsx`, and there is no Rust crate here ([0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)). It owns the Workspace Shell (a flat Bot list and the Panes), the Bot registry, the official dsh protocol client and the loopback control clients. Product shape: [personal-agent spec](../../docs/specs/2026-11-20-personal-agent.md), decision: [GLOSSARY](../../docs/GLOSSARY.md). Architecture and DSH boundaries: [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md). Coding guardrails: [AGENTS.md](AGENTS.md).

Bundle id: `com.aningdev.dshbot` (see `nsh.json`). The tree keeps its `nsh init` shape ([project structure](https://nsh.dev/docs/project-structure.md)).

```text
apps/client/
├── App.tsx / App.test.tsx      # mount AppShell
├── components/
│   ├── app/                    # product compositions over shadcn-nsh parts (Appear, IconTile, ImageViewer, OptionSegmented, Shortcut)
│   ├── shell/                  # Navigator (flat Bot list), Panes, settings overlay, commands, prefs, attention
│   └── ui/                     # shadcn-nsh copies, added with its CLI; theme.json is the theme
├── features/                   # bots (registry, Pane, details), tickets, dialogue (chat, segments), workspace, settings
├── lib/                        # dsh, host, background
├── screens/                    # open(…) entries, screenshots, opt-in real-Host smokes
├── themes/                     # what shadcn-nsh's `add theme-*` copies in (`default/`: its own colours; `shadcn/`: the build theme again, as an `AppTheme`)
├── nsh.json                    # plain TSX: no "rust" key
└── assets/
```

## Commands

Day-to-day: root `bun run dev [target]` — it checks `node_modules` and rebuilds the Host first, then starts the matching script below.

From the repo root with `vp run` (do not use `bun --cwd`):

```sh
vp run @dsh-bot/client#check            # nsh check + nsh build + ui:diff
vp run @dsh-bot/client#dev              # desktop, starts the Host
vp run @dsh-bot/client#dev:macos        # also dev:windows / dev:linux / dev:gpui
vp run @dsh-bot/client#dev:web
vp run @dsh-bot/client#dev:mobile       # Mac Catalyst
vp run @dsh-bot/client#dev:ios
vp run @dsh-bot/client#dev:android
vp run @dsh-bot/client#dev:server       # nsh dev --server-only
vp run @dsh-bot/client#test
vp run @dsh-bot/client#build            # bytecode (nsh build)
bun run ui:diff                       # components/ui vs the shadcn-nsh registry (see check)
vp run @dsh-bot/client#package:macos    # .nsh/out/dsh-bot.app, then runs it
vp run @dsh-bot/client#package:web      # also package:windows / linux / gpui / ios / android
```

- Day-to-day UI: `bun run dev [target]` at the repo root; these scripts are the low-level layer it calls.
- Service only (attach your own simulator/host): `dev:server`.
- `package:macos` produces an NSH-installable `.app`, **not** the finished App + Host + `SMAppService` product.
- Real-Host smokes are opt-in: `screens/*.smoke.test.tsx` returns unless `DSH_BOT_SMOKE_HOST` is set, and that is also the only way a test app reaches the local control plane (an app opened by `test/open.ts` never probes or spawns). See [screens/README.md](screens/README.md).
- Tests that open the app use [`test/open.ts`](test/open.ts): its host parameter makes the registry and shell prefs use the test app's isolated storage, never the real `~/.dsh-bot`.

## Shell

- **Navigator**: collapsible left `ResizablePanel` of shadcn-nsh (232 default, 160–480) under the hidden title bar's drag region: a search field (`⌘F`), the **Pin** group, the rest of the Bots by recent activity (a Bot's Workspaces and Sessions; a working dot, an unread count, a waiting-approval dot), the **New Bot** row (`⌘N`) and, in the footer, the Host's state plus **⚙ Settings** (`⌘,`). No domain sections, no trees, no Session rows. A row's secondary click offers Pin / Bot details / Rename / Archive; an archived Bot leaves the list, and a search still finds it with **Unarchive**.
- **Panes**: shadcn-nsh's `DockArea` (center). A Pane shows one Bot's conversation; a press opens the active Pane on it, a drag to the right drops it into a new Pane beside the active one, and a Bot that already has a Pane only moves the focus. Split (right / down), resize, zoom, close and the focus shortcuts come from the DockArea and the command table. The layout, each Pane's Bot and the active Pane are restored from client prefs; a Bot that is gone leaves its Pane empty. No tabs.
- **Pane header**: the Bot's mark (breathing while it works), its name, the working directory (press it to edit; a different directory starts a new segment), then **Bot details** beside split / zoom / close. The Pane body is the conversation; the modal holds the segment's facts.
- **Tickets and Attention**: a Bot's Pane starts with the Tickets that Bot executed (title, status, last update); a Ticket opens its own Session for reading and a reply, and the Attentions it waits on, without claiming that Session as a segment of the Bot. The Navigator's **Needs you** row counts every pending Attention on this Device and opens the inbox; a question takes its options plus optional custom text, an approval takes Allow or Reject, all through the `tickets` Remote (`answer`, `cancel`), so an answer leaves every Device's list. There is no push: Attentions remind while the Client is open.
- **Bot details** (`features/bots/BotDetails.tsx`): one modal over the Pane — Profile / Runs with / Skills / Plugins, the current segment's working directory, model, usage / context and dsh's **Compact**, and Delete / Archive. Profile and Runs with write registry preferences; Skills and Plugins read the Bot's preset composition and derive its own preset when the preset writer is available, else say why they cannot save.
- **Settings**: a whole-page overlay over the Panes (the Panes keep their layout, scroll and drafts underneath). Its left rail holds **模型供应商 / 通用 / 后台 / 设备 / 关于** on the Runner's desktop Client, and omits **设备** on web and other Clients that have no Host beside them (`hasHost` in `components/shell/host.ts`). A window under 600 pt stacks that rail across the top. Back or Escape returns.
  - **Model providers** (`features/settings/ModelProviders.tsx`): every provider dsh reports (`llm.listProviders` joined with `llm.listConfigurableProviders`) with its key state. A key goes only through `credentials.describe/set/unset`, under the reference the provider's own settings names (or dsh's `<ROUTE>_API_KEY` derivation); the page never holds it. Provider fields (base URL first) and the default model are written with `settings.describe/update` — the default lives in the `agent-default-model` namespace dsh describes, not a hard-coded list. With no Host it explains why and offers no input.
  - **General**: the language row (跟随系统 / 简体中文 / English), appearance (system / light / dark) and the colour (中性 / 柑橘 — the shadcn-nsh themes the app carries; a pick repaints every surface at once, without a relaunch). All apply at once and persist in client prefs; following the system reads a `zh*` locale as 简体中文 and anything else as English, and follows a change.
  - **Background**: the Host and dsh web phase, the Host's own version, the dsh version it found beside the one it requires (a mismatch names both and says the Host refuses to start), recent errors, and start / stop / restart of dsh — then the Background Services registration panel.
  - **Devices** (`features/devices/`): the paired Devices on this Runner. The list (name, platform, online, last seen, paired at) is owned by `features/devices/state.ts`: `GET /bridge/devices`, then `/watch` frames whose `event` is `bridge.devices`. **添加设备** asks the Host for a pairing link and draws it as a QR code, with a copy button and a countdown; an expired link asks for another, and a new link replaces the unused one. The link stays on that screen: it is not stored and not logged. With no Relay configured, the page shows why and does not ask for a link. Revoke confirms in an alert, then `DELETE /bridge/devices/{deviceId}`, and the list becomes the body that came back.
  - **About**: dsh-bot / Host / dsh versions and **复制诊断信息**, which copies versions and connection state only (no key, token or Session content).
- **Conversation**: a Bot's Pane is its one long conversation, one continuous transcript of segments (Sessions) in time order, drawn with shadcn-nsh's `message-scroller` (its viewport, content, item and way-back button) and, inside it, `message` (a turn), `bubble` (its frame), `marker` (a day or a segment divider, and the notes a turn leaves), `attachment` (a file a message carries, and the files the composer holds) and `collapsible` (what a call, a step or a thought folds away). It follows the newest message while the reader is at the end and stops as soon as they scroll up, which shows the way-back button over the last row; older pages and segments load as the transcript reaches the top, and the row the reader was on stays where it was. A divider between segments names the date and the working directory (under the home directory it reads `~/…`; the full path stays in the tooltip); older segments and older pages inside a segment load through the official Session model as the transcript reaches the top. The history rail on the right edge has one mark per segment (current highlighted); hover opens a popup card with its title, time and middle-truncated directory, a press jumps to its start, and the rail is one keyboard stop with ↑ / ↓ / Return and VoiceOver labels. Only the latest segment accepts prompts; older ones stay copyable and locatable. The palette's **新话题** or `/new` starts a segment in the current directory; editing the directory in the header starts one there. Near the context limit, **Compact** stays inside the segment. A Bot with no segment offers to start one in its default working directory.
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

- Tickets and Attentions: the `tickets` plugin owns them; the Client reads one snapshot through the `tickets` Remote (`snapshot`, then `watch`) and writes answers and cancellations through it ([`features/tickets/state.ts`](features/tickets/state.ts)). The snapshot is the only copy on the Device; no Ticket Session is written into the Bot registry.
- Registry: the `bots` plugin owns it, at `$DSH_BOT_HOME/bots/registry.json`. The Client reads it through the `bots` Remote (`snapshot`, then `watch`) and writes through the same methods; it does not keep a copy on the Device. Version 6 holds templates and Bots; each Bot carries its one long conversation as `segments` (`sessionId` + `workspaceId` + the person's title), oldest first. The plugin keeps the Main Bot (`bots-main`) first and refuses to archive or delete it. Identity, the archive flag and the segment claims stay registry data ([0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md)); Workspace paths, titles, Session order and archive are dsh's ([GLOSSARY](../../docs/GLOSSARY.md)). Pins, Panes, theme and language stay on the Device.
- Workspaces and Sessions: the official `ClientWorkspaceModel` / `ClientSessions` are installed on the Connection's Cordis context (`lib/dsh/connection.ts`), so each Host generation replaces their snapshots atomically. `features/workspace` and `features/dialogue/session` only project those snapshots into NSH signals; Remote responses never write that state. Their browser `__ModuleLoader__` bundles are unwrapped into static ESM by `prepare:sdk` (`lib/dsh/generated/`), because NSH refuses code from strings.
- Client prefs: `~/.dsh-bot/prefs/client.json` on desktop; Storage (`dsh-bot.prefs.shell`) elsewhere. Version 2 covers the Navigator's width and open state, the pinned Bot ids, the Panes (layout, each Pane's Bot, the active one) and the General page's appearance, language and colour (an older file reads the defaults; a colour id this build does not carry is the build-time theme). A version 1 file is read once: Bot pins are kept, a Dialogue or Session pin becomes the Pane of the Bot it belonged to, and the Session pins themselves are dropped. The chat's send-key preference is a small Storage key of its own (`dsh-bot.prefs.sendKey`).
- `capabilities.fs` grants read/write only `${homeDir}/.dsh-bot`. Attachments come from the system picker; a drop or paste outside the grant falls back to the same picker — see [0007](../../docs/decisions/0007-the-client-is-pure-tsx.md).

## Languages

The whole interface is 简体中文 or English. Every user-visible string — the Navigator, Pane chrome, transcript and rail, Bot details, New Bot, ⌘K, context menus, the application menu and shortcut help, notifications, toasts, empty states, Settings' groups, and the Client's own Host / launcher / Background Services messages — lives in one catalog, [`lib/i18n/messages.ts`](lib/i18n/messages.ts), with a typed key: a missing key or language fails `nsh check`. Views read text only through `t(key, values)`, so Settings › General's choice redraws in place, without a relaunch; the preference is saved with the other client prefs, and **跟随系统 / Follow system** reads NSH's `locale()` (a `zh*` tag is 简体中文, anything else English) and follows a change. See [ARCHITECTURE §5](../../docs/ARCHITECTURE.md).

Not translated, by design: what a person typed and what a Bot is called (Bot names, message and model replies, segment titles), product and proper names (dsh-bot, Host, dsh, Relay, DeepSeek, model ids, Agent preset ids, `/new`), the text dsh itself returns (provider names and dsh error bodies, shown verbatim inside a translated frame), shell commands, keyboard key names, and file paths. A language picker shows each language in its own words (简体中文, English).

## Known limitations

- Narrow windows show the mobile notice; the desktop shell starts at 700 pt (desktop idiom) / 900 pt (others).
- There is no per-segment archive or delete in the UI; archiving is the Bot's, and its segments and logs stay.
- dsh's Session model catalog is credential-gated: with no working key it lists no models, so the default-model card falls back to the `models` each provider's settings advertise and the current selection. See [ARCHITECTURE §4](../../docs/ARCHITECTURE.md).
- Bot details cannot save Skills / Plugins changes when the Host does not mount `dsh-bots`: no other Remote writes an Agent preset body. See the gaps table in [ARCHITECTURE §4](../../docs/ARCHITECTURE.md).
- The dsh mux can drop a peer that misses two heartbeats while the client is blocked; the Session controller re-follows (3 tries, backoff). Details in [dsh-connection](../../docs/architecture/dsh-connection.md).

## Native layer: the Host this app starts (desktop only)

There is no Rust in this app ([0007](../../docs/decisions/0007-the-client-is-pure-tsx.md)). The Host is loopback HTTP + one WebSocket on `127.0.0.1:4872` (`DSH_BOT_HOST_PORT`), authenticated by `<data root>/host/serve-token`. OS registration is the Host's own snapshot (`version`, `phase`, optional `reason`); the public Relay is not a local control plane and is not registered with the OS.

- `lib/host/launcher.ts` starts the Host when none answers (`dsh-bot-host serve-app`), reuses one that does, and starts it again after an exit (1 s doubling to 15 s). It needs `dsh-bot-host` on `PATH`; `cargo build -p dsh-bot-host` puts it in `target/debug`, and `scripts/run-with-host-path.mjs` puts that folder first for the desktop `dev*` scripts (`dev`, `dev:macos`, `dev:windows`, `dev:linux`, `dev:gpui`). Prefer repo-root `bun run dev [target]`, which rebuilds the Host when its sources moved on and only wires that `PATH` for desktop targets.
- `lib/host/client.ts` is the transport (`fetch` + standard `WebSocket`); `lib/host/control.ts` is the product surface (`ensureBackendReady`, `resolveDshLoginUrl`, `watchHostStatus`, and `bridgeAccess` for `GET /bridge/devices`, `POST /bridge/pairing`, `DELETE /bridge/devices/{deviceId}`). `/watch` carries public status frames and `bridge.devices` on the same socket; an unknown `event` is logged and ignored, and is not treated as the Host dropping. The Host's public status also carries `hostVersion` and the `dshVersion` its guardian found, which Background and About show.
- The sidebar footer is the Host empty state when the launcher cannot run one: its reason plus the manual `dsh-bot-host serve-app`.
- `dev:ios` / `dev:android` / `dev:mobile` / `dev:web` / `dev:server` / `package:*` start no Host — other Devices reach the Runner through the public Relay, not the local Host.

## Related

- [ARCHITECTURE §5](../../docs/ARCHITECTURE.md) — client structure and the dsh gaps table.
- [docs/specs/2026-11-13-bot-app.md](../../docs/specs/2026-11-13-bot-app.md) — what this round must deliver.
- [dsh-connection](../../docs/architecture/dsh-connection.md) — loopback cookie bootstrap and mux heartbeat limits.
- [0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md) / [0007](../../docs/decisions/0007-the-client-is-pure-tsx.md) / [GLOSSARY](../../docs/GLOSSARY.md) — registry-owned identity; app-data-only `fs`; the Bot app's one long conversation and Panes.
- [screens/README.md](screens/README.md) — screenshots and opt-in real-Host smokes.
