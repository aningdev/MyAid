# dsh-tickets

[English](README.md) | 中文

拥有 Ticket——Main Bot 交给某个 Bot 的工作——以及 Ticket 停下来等 Owner 的 Attention，并对外提供 Source 插件注册用的 `sources` 服务。每张 Ticket 在自己的 dsh Session 里、用目标 Bot 的 Agent preset 执行；Session 需要 Owner 时，Ticket 等待一个 Attention，而不是静默卡住，任何 Device 都通过 `tickets` Remote 回答。来自 Source 的 Trigger 先记在这里，只有 Owner 的身份能把它变成工作。

决定：[0002](../../docs/decisions/0002-main-bot-delegates-through-tickets.md)。用词：[GLOSSARY](../../docs/GLOSSARY.md)。插件规则：[packages/AGENTS.md](../AGENTS.md)。

## 数据

| 内容                       | 位置                                                         |
| -------------------------- | ------------------------------------------------------------ |
| Ticket、Attention、Trigger | `<dataDir>/tickets.json`；`dataDir` 默认 `$DSH_HOME/tickets` |

文件是一份 version 2 文档加单调递增的 `revision`。每次写入先写临时文件再改名，并把 Ticket 与它的 Attention 放进同一次写入，读的人不会看到半个状态转移。`snapshot` 返回 Ticket、仍处于 pending 的 Attention、已配置的 Source、投递过的全部 Trigger，以及已经开出 Main Bot Session 的 Source thread；已回答、已撤回和已忽略的留在文件里作为历史。

停机中的 Host 无法回答它等待的问题：加载时会把所有 pending 的 Attention 撤回，对应 Ticket 回到 `open`。

## 状态机

```text
open ──提问 / 审批──▶ waiting ──回答 / 撤回──▶ open
 │                       │
 ├──completed ◀──────────┤        （`ticket_report`：completed）
 ├──failed ◀─────────────┤        （`ticket_report`：failed、Session 出错、Session 没起来）
 └──cancelled ◀──────────┘        （Owner 取消；终态）

completed | failed ──Owner 在 Ticket Session 里发消息──▶ open
```

Ticket 的状态属于 Ticket，不属于它的 Session：一轮结束不是结果（决定 0002）。Session 空闲之后 Ticket 仍是 `open`；它的 Bot 通过 `ticket_report` 报告一次，才显式结束这张 Ticket。`cancelled` 不会恢复。Attention 只会 `pending → answered` 或 `pending → withdrawn`。

## Source

本插件提供 `sources` 这个 Cordis 服务（`ctx.sources`）。Source 插件把一种 kind 和一个已配置实例作为一次 effect 注册，返回的函数把两者一起移除：

```ts
ctx.sources.register({
  kind: {
    kind: "feishu",
    title: { zh: "飞书", en: "Feishu" },
    description: "Owner 的飞书会话",
    config: z.object({ ownerOpenId: z.string(), appId: z.string(), appSecret: z.string() }),
    owner: (config) => config.ownerOpenId,
    channel: { send: async (instance, message) => "sent" },
  },
  instance: { id: "feishu-owner", enabled: true, config: { … } },
});
```

- `owner(config)` 给出 Owner 在这个 Source 上的身份。Trigger 不会把一个 Source 的身份映射到另一个 Source。
- `channel.send(instance, { thread, address, text })` 是写出端：Source 插件把 `text` 发到 `address`，回 `sent` 或 `gone`。
- Source 插件用 `ctx.sources.deliver(instanceId, { id, thread, address, at, human, text })` 交付 Trigger，返回值是 `accepted`、`ignored` 或 `duplicate`。

Trigger 投递后不可变，并连同处理结果一起落盘；同一个 Source 上重复的 `id` 得到 `duplicate`，什么都不改。只有 `human.id` 等于 Source 的 Owner 身份的 Trigger 是 `accepted`；其余记为 `ignored`，不开 Session、不调用模型、不写 Channel。

被接受的 Trigger 进入跟随该 `(Source, thread)` 的 Main Bot Session——首次使用时用 Main Bot 的 preset 创建，按 Source 和 thread 命名——是一条带 trigger 标记的 `tickets` 消息。Main Bot 在这个 Session 里回应：

- `ticket_open` 绑定该 Source thread 最老的待处理 Trigger，把它记作 Ticket 的 origin（Source、kind、trigger id、thread、address），并通过 Channel 只发一次确认；
- 这一轮结束却没开 Ticket 时，把最后一条 assistant 消息经同一个 Channel 写回一次；
- Ticket 结束时，结果经同一个 Channel 回到原来的地址。

## Session

`open` 用显式 id（`ticket-session-<ticketId>`）、Bot 的默认工作目录（或调用方指定的目录）和目标 Bot 的 Agent preset 建 Session，best-effort 命名，然后投递请求。本插件投递的消息带 `tickets` source、不带 `user`，所以只有人在 Session 里输入才算 Owner。Session 的模型和 thinking 来自 Bot 的 preset。

子代理的 Session 沿 `parentSession` 归到创建它的 Ticket 上，所以它的提问和审批会变成那张 Ticket 的 Attention；带超时的问题仍交给 dsh 自己的 answerer。

## Main Bot

工具在 Agent 创建时挂上：`ticket_open` 挂在 Main Bot 自己的 Session（按 preset 或所属段识别），`ticket_report` 挂在每个 Ticket Session。

| 工具            | 参数                                                   |
| --------------- | ------------------------------------------------------ |
| `ticket_open`   | `bot`（名字或 id）· `title` · `task` · `workspacePath` |
| `ticket_report` | `status`（`completed` 或 `failed`）· `result`          |

`ticket_open` 的描述里列出已就绪的 Bot，Main Bot 不用再问一轮。`ticket_report` 是 Ticket 的 Bot 结束工作的方式；结束之后再报告会被拒绝。从 Main Bot Session 开出的 Ticket 结束后，结果以 `tickets` 汇报消息投回开出它的 Session。

## Attention

Ticket Session 提出的问题或审批会变成 Attention：Ticket 变为 `waiting`，Session 保持阻塞，答案交回给它。Ticket 之外的请求（包括带超时的问题）交给 dsh 自己的 answerer。

## Remote

Typert 消费面从 `./remote` 导出。

| 方法       | 作用                                                         |
| ---------- | ------------------------------------------------------------ |
| `snapshot` | Ticket、pending 的 Attention、Source 与 Trigger，带 revision |
| `watch`    | snapshot 流，每次写入后推送                                  |
| `answer`   | 回答一个 Attention；Ticket 恢复并继续                        |
| `cancel`   | 以 Owner 身份取消一张进行中的 Ticket，撤回它的 Attention     |

## 命令

```sh
vp run dsh-tickets#build
vp run dsh-tickets#test
vp run dsh-tickets#check
```

`scripts/dev.mjs` 会构建本包并把它的行加入开发 overlay（`plugins.patch.yml`）。

## 已知限制

- Bot 必须调用 `ticket_report`；一轮结束却没有报告时，Ticket 停在 `open`，不算完成。
- 带超时的问题交给 dsh 的 answerer；只有没有超时的提问和审批会变成 Attention。
- 写入在 Host 进程内串行，并且整份替换：两个 Device 同时写会按到达顺序依次生效，`revision` 不是冲突检测用的版本号。
- 每个 `(Source, thread)` 只有一个 Main Bot Session；连续投递的多个 Trigger 一次只绑定一张 Ticket。
- Client 还没有 Tickets 界面；目前只有 Remote 这一个面。
