# dsh-bot

English | [中文](README.zh.md)

dsh-bot is a **personal agent on every device**. One Main Bot takes your requests, from the app on any device or from a chat you already use, and hands the work to specialised Bots. All of it runs on your own desktop through the official DeepSeek Harness (`dsh web`), and it keeps up with each dsh release.

## What it does

- **One Main Bot, many Bots.** Ask the Main Bot. It answers itself, or opens a **Ticket** for the Bot that fits, such as a researcher or a coder. You can talk to any Bot directly too.
- **Work you can watch and steer.** Each Ticket runs in its own session under its Bot. Open it, read along, or step in with a message.
- **Asked only when it matters.** A Ticket stops only for a decision or a result to review, and that **Attention** reaches every device you have paired.
- **Every device, no network setup.** Pair a phone or a browser by scanning a code on the desktop. Traffic goes end to end encrypted through a Relay that sees only ciphertext. You open no ports and set up no domains.
- **Requests from where you already are.** Connect a Source, such as an IM chat or a GitHub repository, and mention your bot there. Messages from anyone else do nothing.
- **Extended through dsh plugins.** Skills, tools and new Sources are dsh plugins. dsh itself stays unmodified.

## Pieces

| Piece            | Role                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Client** (NSH) | The app on every device: Bots, Dialogues, Tickets, Attentions, settings                                 |
| **Runner**       | Your desktop: it runs the Host and `dsh web` and does all the work                                      |
| **Host**         | The background service on the Runner: `dsh web` lifecycle and the Bridge to the Relay                   |
| **Plugins**      | `bots` (Bot registry and the Main Bot), `tickets` (delegation and Attentions), `source-*` (each Source) |
| **Relay**        | A zero-knowledge public relay. The project runs a default one, and you can host your own                |

## Platforms

- **Runner:** macOS, Windows or Linux desktop.
- **Devices:** iOS, Android, other desktops and the web.

## Documentation

| Doc                                  | About                                    |
| ------------------------------------ | ---------------------------------------- |
| [GLOSSARY](docs/GLOSSARY.md)         | The product's terms                      |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Layers, layout, seams and data ownership |
| [decisions/](docs/decisions/)        | Why the hard-to-undo choices were made   |
| [specs/](docs/specs/)                | What each feature must achieve           |

dsh-bot does not ship DeepSeek branding or the official dsh Web GUI. It reuses the execution plane and builds its own UI on NSH.

## Developers

Constraints: [AGENTS.md](AGENTS.md). Doc rules: [docs/AGENTS.md](docs/AGENTS.md). Unit contracts: [apps/client](apps/client/README.md), [apps/host](apps/host/README.md), [apps/relay](apps/relay/README.md), [packages/](packages/README.md).

```sh
git submodule update --init references/
bun install
bun run dev --isolated[=name]   # desktop against ~/.dsh-bot-dev/<name>, port 4873
bun run dev web                 # other targets: web / mobile / ios / android / macos / windows / linux / gpui
bun run check
bun run test
```

A plain `bun run dev` uses your real `~/.dsh-bot`. If your data root still carries the earlier name, move it once: `mv <old data root> ~/.dsh-bot`.
