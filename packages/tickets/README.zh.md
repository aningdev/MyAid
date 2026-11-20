# dsh-tickets

[English](README.md) | 中文

拥有 Ticket——Main Bot 交给某个 Bot 的工作——以及 Ticket 停下来等 Owner 的 Attention。每张 Ticket 在自己的 dsh Session 里、用目标 Bot 的 Agent preset 执行；Session 需要 Owner 时，Ticket 等待一个 Attention，而不是静默卡住，任何 Device 都通过 `tickets` Remote 回答。

决定：[0002](../../docs/decisions/0002-main-bot-delegates-through-tickets.md)。用词：[GLOSSARY](../../docs/GLOSSARY.md)。插件规则：[packages/AGENTS.md](../AGENTS.md)。

## 数据

| 内容              | 位置                                                         |
| ----------------- | ------------------------------------------------------------ |
| Ticket、Attention | `<dataDir>/tickets.json`；`dataDir` 默认 `$DSH_HOME/tickets` |

文件是一份 version 1 文档加单调递增的 `revision`。每次写入先写临时文件再改名，并把 Ticket 与它的 Attention 放进同一次写入，读的人不会看到半个状态转移。`snapshot` 只返回 Ticket 和仍处于 pending 的 Attention；已回答和已撤回的留在文件里作为历史。

停机中的 Host 无法回答它等待的问题：加载时会把所有 pending 的 Attention 撤回，对应 Ticket 回到 `open`。

## 状态机

```text
open ──提问 / 审批──▶ waiting ──回答 / 撤回──▶ open
 │                       │
 ├──completed ◀──────────┤        （一轮结束且有结果）
 ├──failed ◀─────────────┤        （Session 出错，或 Session 起不来）
 └──cancelled ◀──────────┘        （Owner 取消；终态）

completed | failed ──Owner 在 Ticket Session 里发消息──▶ open
```

Ticket 的状态属于 Ticket，不属于它的 Session：Session 空闲只说明这一轮结束，不一定是工作结束（决定 0002）。`cancelled` 不会恢复。Attention 只会 `pending → answered` 或 `pending → withdrawn`。

## Session

`open` 用显式 id（`ticket-session-<ticketId>`）、Bot 的默认工作目录（或调用方指定的目录）和目标 Bot 的 Agent preset 建 Session，best-effort 命名，然后投递请求。本插件投递的消息带 `tickets` source、不带 `user`，所以只有人在 Session 里输入才算 Owner。Session 的模型和 thinking 来自 Bot 的 preset。

## Main Bot

Main Bot 拿到一个工具，在它的 Agent 创建时挂上（它自己的 Session 按 preset 或所属段识别）：

| 工具          | 参数                                                   |
| ------------- | ------------------------------------------------------ |
| `ticket_open` | `bot`（名字或 id）· `title` · `task` · `workspacePath` |

工具描述里列出已就绪的 Bot，Main Bot 不用再问一轮。Ticket 结束后，结果以 `tickets` 汇报消息投回开出它的 Session，Main Bot 在自己的对话里看到结局。

## Attention

Ticket Session 提出的问题或审批会变成 Attention：Ticket 变为 `waiting`，Session 保持阻塞，答案交回给它。其他 Session 的请求、timed 问题和子 agent 的审批交给 dsh 自己的 answerer。

## Remote

Typert 消费面从 `./remote` 导出。

| 方法       | 作用                                                     |
| ---------- | -------------------------------------------------------- |
| `snapshot` | Ticket 与 pending 的 Attention，带 revision              |
| `watch`    | snapshot 流，每次写入后推送                              |
| `answer`   | 回答一个 Attention；Ticket 恢复并继续                    |
| `cancel`   | 以 Owner 身份取消一张进行中的 Ticket，撤回它的 Attention |

## 命令

```sh
vp run dsh-tickets#build
vp run dsh-tickets#test
vp run dsh-tickets#check
```

`scripts/dev.mjs` 会构建本包并把它的行加入开发 overlay（`tickets.patch.yml`）。

## 已知限制

- Ticket 在 Session 的一轮结束时完成：Bot 在一轮之外继续做的事不在跟踪范围内。
- 只有 Ticket Session 自己的问题和审批会产生 Attention；子 agent 的审批由 dsh 的 answerer 回答。
- Tickets 文件按 revision 后写者覆盖：两个 Device 同时写会在 Host 上串行，后一次整份覆盖前一次。
- `sources` 服务（Source 注册）尚未实现。
- Client 还没有 Tickets 界面；目前只有 Remote 这一个面。
