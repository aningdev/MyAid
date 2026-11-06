# MyAid

English | [中文](README.zh.md)

MyAid is an **all-in-one personal assistant**: one place for the parts of life and work where people and AI operate together—mail, broad **Tasks**, knowledge, notes, and more—connected through **Bots** and **Dialogues**.

- **Capability base:** official DeepSeek Harness (`dsh`) for execution, tools, plugins, and approvals.
- **Multi-end shell:** Native Shell (NSH) for desktop and future mobile UI.
- **Desktop home, local ops, linkable ends:** the app runs on **one desktop**; data and execution stay **on that machine**; other devices **link back** to it (NSH clients + Relay). **Host** plus official **`dsh web`** (web profile) own the local run; closing the UI need not tear down that home once you enable background.

## What it is for

- **Connect everyday domains** — mail, Tasks, knowledge, and notes are first-class; Dialogues drive them and jump back from them.
- **Talk with a Bot** — a **Bot** is a contact-like assistant whose abilities are a (often derived) **Agent preset**; a **Dialogue** is a long thread with that Bot (e.g. one per project workspace); a **Session** is one context scene inside that Dialogue (= one harness Session).
- **Stay in control of identity** — Bots own preset/capabilities; Dialogues own workspace path; Sessions are claimed to a Dialogue.
- **Keep the desktop reachable** — Host (and later Relay) can stay as OS Background Services so other ends can link when the window is closed; you explicitly enable that.
- **Extend hands with plugins** — skills attach on the shared `web` profile / derived presets via Cordis bundles.

## How the pieces fit (product view)

| Piece                                    | Role for you                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Client (NSH)**                         | Multi-end control surface: domains, Bots, Dialogues, approvals, background                               |
| **Host**                                 | Local Background Service: `dsh web` lifecycle, discovery, Bridge                                         |
| **`dsh web`** (product nickname: Runner) | Official execution plane on the web profile: Sessions, tools, events — _Runner is not a DSH proper noun_ |
| **Plugins**                              | Capability packs that extend what assistants can do                                                      |
| **Relay** (target)                       | Ciphertext link so other devices reach the desktop home                                                  |

Product rules: [docs/BLUEPRINT.md](docs/BLUEPRINT.md). Terms: [GLOSSARY.md](GLOSSARY.md). Map: [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md).

## Platforms

- **Home:** one macOS desktop (NSH + optional `SMAppService` so the local home stays up).
- **Also:** Windows Host control-channel bring-up for development; full Windows desktop product and finished background registration are not promised yet.
- **Linkable ends:** mobile NSH clients via Relay; Bot and credentials stay on the desktop home.

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
bun run dev      # Host + Client
bun run check
```
