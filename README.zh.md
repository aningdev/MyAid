# dsh-bot

[English](README.md) | 中文

dsh-bot 是一个**在每台设备上都能用的个人 Agent**。你可以在任意设备的 App 里，或者在常用的聊天工具里提请求，由一个 Main Bot 接住，再把工作分给专用的 Bot。所有工作都在你自己的桌面上，由官方 DeepSeek Harness（`dsh web`）执行，并随 dsh 的每个版本一起升级。

## 它能做什么

- **一个 Main Bot，多个 Bot**：请求交给 Main Bot，它自己能答的直接答，需要动手的就开一张 **Ticket**，交给合适的 Bot（例如研究员、程序员）。你也可以直接和任何一个 Bot 对话。
- **工作看得见、插得上手**：每张 Ticket 在自己所属 Bot 下的独立会话里执行。你可以打开它看过程，也可以随时发消息介入。
- **只在需要你时才打扰**：Ticket 只有在需要你做决定或审阅结果时才会停下，这条 **Attention** 会出现在你配对过的每台设备上。
- **全端可用，不用自己配网络**：在桌面上扫码就能配对手机或浏览器。流量端到端加密后经过 Relay，Relay 只看得到密文。不用开端口，也不用配域名。
- **在你常用的地方提请求**：接入一个 Source（例如 IM 会话或 GitHub 仓库）后，在那里 @ 你的 bot 即可。其他人发的消息不会触发任何动作。
- **用 dsh 插件扩展**：skills、工具和新的 Source 都是 dsh 插件，dsh 本身保持原样。

## 组成

| 部件              | 作用                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **Client**（NSH） | 每台设备上的 App：Bot、长对话、Ticket、Attention 和设置                                        |
| **Runner**        | 你的桌面，运行 Host 和 `dsh web`，所有工作都在这里执行                                         |
| **Host**          | Runner 上的后台服务，负责 `dsh web` 的生命周期，并通过 Bridge 连到 Relay                       |
| **插件**          | `bots`（Bot 注册表和 Main Bot）、`tickets`（委派和 Attention）、`source-*`（每个 Source 一个） |
| **Relay**         | 零知识的公网中继，项目提供默认实例，你也可以自建                                               |

## 平台

- **Runner**：macOS、Windows 或 Linux 桌面。
- **Device**：iOS、Android、其他桌面和 web。

## 文档

| 文档                                 | 内容                        |
| ------------------------------------ | --------------------------- |
| [GLOSSARY](docs/GLOSSARY.md)         | 产品术语                    |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 分层、布局、seam 和数据归属 |
| [decisions/](docs/decisions/)        | 难以撤销的选择为什么这样定  |
| [specs/](docs/specs/)                | 每个功能要达成的目标        |

dsh-bot 不带 DeepSeek 品牌，也不用官方 dsh 的 Web GUI：它只复用执行层，界面用 NSH 自己做。

## 开发者

约束：[AGENTS.md](AGENTS.md)。文档规范：[docs/AGENTS.md](docs/AGENTS.md)。单元契约：[apps/client](apps/client/README.zh.md)、[apps/host](apps/host/README.zh.md)、[apps/relay](apps/relay/README.zh.md)、[packages/](packages/README.zh.md)。

```sh
git submodule update --init references/
bun install
bun run dev --isolated[=name]   # 桌面，数据根 ~/.dsh-bot-dev/<name>，端口 4873
bun run dev web                 # 其他目标：web / mobile / ios / android / macos / windows / linux / gpui
bun run check
bun run test
```

不带参数的 `bun run dev` 会用你真实的 `~/.dsh-bot`。如果数据根还是旧名那个，执行一次 `mv <旧数据根> ~/.dsh-bot` 迁移。
