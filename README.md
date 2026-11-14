# MyAid

English | [中文](README.zh.md)

MyAid is a **lorca-style desktop Bot app**: manage a set of Bots, talk with several of them at once in tiled panes, and point them at the model you want.

- **Capability base:** official DeepSeek Harness (`dsh`) for execution, tools, plugins, and approvals.
- **Multi-end shell:** Native Shell (NSH) for desktop and future mobile UI.
- **Desktop home, local ops, linkable ends:** the app runs on **one desktop**; data and execution stay **on that machine**; other devices **link back** to it (NSH clients + Relay). **Host** plus official **`dsh web`** (web profile) own the local run; closing the UI need not tear down that home once you enable background.

## What it is for

- **See your Bots at a glance** — a flat left list: search, **Pins**, the rest by recent activity (a working dot, unread counts), and **New Bot**. No domains, no trees.
- **Talk with several Bots at once** — the center tiles **Panes** (split, resize, close, drag a Bot in, ⌘ to move focus); a Bot lives in one Pane, and clicking it again only moves the focus.
- **One long conversation per Bot** — a Bot's history is its **segments** (dsh Sessions) in time order; segments may sit in different dsh Workspaces. This round opens a Bot on its most recent Session; the continuous view lands next.
- **Bot details without leaving the Pane** — a modal over the Pane holds Profile, Runs with, Skills, Plugins, the default working directory, delete / archive, and the current segment's path, model, usage and Compact.
- **Stay in control of identity** — Bots own preset/capabilities; the registry owns names, Pins and the archive flag; dsh owns Workspaces and Sessions.
- **Keep the desktop reachable** — Host (and later Relay) can stay as OS Background Services so other ends can link when the window is closed; you explicitly enable that.
- **Extend hands with plugins** — skills attach on the shared `web` profile / derived presets via Cordis bundles.

## How the pieces fit (product view)

| Piece                                    | Role for you                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Client (NSH)**                         | Multi-end control surface: Bot list, Panes, Bot details, settings, approvals, background                 |
| **Host**                                 | Local Background Service: `dsh web` lifecycle, discovery, Bridge                                         |
| **`dsh web`** (product nickname: Runner) | Official execution plane on the web profile: Sessions, tools, events — _Runner is not a DSH proper noun_ |
| **Plugins**                              | Capability packs that extend what assistants can do                                                      |
| **Relay** (target)                       | Ciphertext link so other devices reach the desktop home                                                  |

Product rules: [docs/BLUEPRINT.md](docs/BLUEPRINT.md). Terms: [GLOSSARY.md](GLOSSARY.md). Map: [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md).

## Platforms

- **Home:** one macOS desktop (NSH + optional `SMAppService` so the local home stays up).
- **Also:** Windows Host control-channel bring-up for development; full Windows desktop product and finished background registration are not promised yet.
- **Linkable ends:** mobile NSH clients via Relay — one column: Bot list → long conversation, Bot details full-screen; Bot and credentials stay on the desktop home.

## Documentation

| Doc                                        | About                                     |
| ------------------------------------------ | ----------------------------------------- |
| [BLUEPRINT](docs/BLUEPRINT.md)             | Product goals and business rules          |
| [ARCHITECTURE](docs/ARCHITECTURE.md)       | Assembly and seams                        |
| [DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md)   | Official `dsh` / Cordis / Host boundaries |
| [DSH_CLIENT_AUTH](docs/DSH_CLIENT_AUTH.md) | Local auth / Cookie WebSocket notes       |
| [GLOSSARY](GLOSSARY.md)                    | Product vs harness vocabulary             |

MyAid does **not** ship DeepSeek product branding or the official harness Web GUI; it reuses the official execution plane and builds its own control UI on NSH.

## Developers

Contributor constraints: [AGENTS.md](AGENTS.md). Doc layout: [docs/AGENTS.md](docs/AGENTS.md). Per-unit contracts and commands: [apps/client](apps/client/README.md), [apps/host](apps/host/README.md), [apps/relay](apps/relay/README.md), [packages/](packages/README.md).

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
bun install
bun run dev        # desktop: rebuilds a stale Host, loads the Bot preset plugin, starts the Client
bun run dev web    # other targets: web / mobile / ios / android / macos / windows / linux / gpui
bun run check
bun run test
```

`bun run dev` verifies before it starts: it runs `bun install` when `node_modules` disagrees with the catalog's `@deepseek-ai/*` versions or when `bun.lock` / a `package.json` is newer than the installed tree, and it rebuilds `myaid-host` when the binary is older than its sources or `apps/host/supported-dsh.json`. The dsh version is written twice only — the root `package.json` → `workspaces.catalog` and `apps/host/supported-dsh.json` — and `bun run check` fails when they disagree.
