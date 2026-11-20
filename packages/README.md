# packages

English | [中文](README.zh.md)

Workspace packages for dsh-bot plugins and Client-facing protocol types. Plugin rules (adopted from dsh): [AGENTS.md](AGENTS.md). Doc standard: [docs/AGENTS.md](../docs/AGENTS.md).

| Package                                                   | Role                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`@dsh-bot/dsh-web-protocol`](dsh-web-protocol/README.md) | Client-only re-exports of the official `dsh web` Remote / wire types in use |
| [`dsh-bots`](bots/README.md)                              | Registry and Main Bot; derived Agent presets; `bots` Remote                 |
| [`dsh-tickets`](tickets/README.md)                        | Tickets and Attention; the Main Bot's `ticket_open` tool; `tickets` Remote  |
