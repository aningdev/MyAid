# packages

[English](README.md) | 中文

dsh-bot 插件与 Client 侧协议类型的 workspace 包。插件规则（取自 dsh）见 [AGENTS.md](AGENTS.md)。文档规范：[docs/AGENTS.md](../docs/AGENTS.md)。

| 包                                                           | 职责                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`@dsh-bot/dsh-web-protocol`](dsh-web-protocol/README.zh.md) | 仅给 Client 用的官方 `dsh web` Remote / 线协议类型（产品实导入的部分） |
| [`dsh-bots`](bots/README.zh.md)                              | Registry 与 Main Bot；派生 Agent preset；`bots` Remote                 |
| [`dsh-tickets`](tickets/README.zh.md)                        | Ticket 与 Attention；Main Bot 的 `ticket_open` 工具；`tickets` Remote  |
