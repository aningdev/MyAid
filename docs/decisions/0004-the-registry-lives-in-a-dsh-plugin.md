# 0004 Registry 放在 dsh 插件里

## Context

原来 Registry（Bot、Identity mark、段归属）是桌面 Client 写在 `~/.dsh-bot/registry/bots.json` 的文件。全端以后，每个 Device 都要读写同一份数据；而且 Main Bot 要派 Ticket，也需要在 dsh 里知道有哪些 Bot。

## Decision

- 新插件 `packages/bots`（`@dsh-bot/bots`，Remote 命名空间 `bots`）拥有 Registry，数据存放在 `$DSH_BOT_HOME` 下。原来的 `bot-presets` 并入这个插件。
- 插件第一次启动时创建 Main Bot，并维护 Main Bot 可以派工的 Bot 列表。
- 插件第一次启动时，如果 `<Data root>/registry/bots.json` 存在，就导入一次，再把它改名为 `bots.json.imported` 留作备份；之后不再读旧格式。
- Client 不再写 Registry 文件，所有 Device 都通过 `bots` Remote 读写。Device 自己的偏好（Pin、Pane 布局、主题、语言）仍留在 Device 上。

## Why

数据集中在 Runner 上，所有 Device 就读写同一份；Main Bot 和 Ticket 在 dsh 里也能直接用到 Bot 列表，不必再绕道 Client。

## Rejected

- **Client 之间同步 Registry 文件**：会有多个写入方，冲突要靠合并解决。
- **存在 Host 里**：Host 不承载业务，dsh 里的 Main Bot 也读不到。
