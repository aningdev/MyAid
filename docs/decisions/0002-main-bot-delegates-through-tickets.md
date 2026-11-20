# 0002 Main Bot 通过 Ticket 委派工作

## Context

产品形态是一个 Main Bot 加若干专用 Bot。Main Bot 要能把工作交给其他 Bot，同时 Owner 要能看到工作进展并随时介入。`references/dsh-superagent-prototype` 已经在 dsh 上跑通了一套同类模型：Source → Trigger → Eval → Ticket → 每个 Ticket 一条 Executor Session。

## Decision

- Main Bot 收到的请求（来自它的 Dialogue 或某个 Source 的 Trigger）由它自己判断，需要动手的就开成 **Ticket**，交给一个 Bot 执行。
- Ticket 在自己的 dsh Session 里执行，用的是执行它的那个 Bot 的 Agent preset。这条 Session 不算进那个 Bot 的 Dialogue，在 Client 里归到那个 Bot 下展示，Owner 可以直接在里面发消息。
- Ticket 的状态归 Ticket 自己，不跟随 Session 的状态。要 Owner 回答或审阅时，Ticket 产生一条 **Attention**。
- 授权只看 Owner identity，不引入团队用的 Policy、admission 表和 Mandate。
- 领域模型和 Source 插件形态参考原型（MIT），按需移植代码，不直接安装原型。

## Why

独立的 Session 可以恢复、可以查看，也能并行，Owner 直接介入时走的就是 dsh 的正常对话。原型已经证明这些规则在 dsh 上可行。

## Rejected

- **用 dsh 的进程内 subagent（`tool-subagent` 加 `allowedAgentPresets`）来委派**：执行过程藏在父 Session 里，不能单独恢复，也看不到进度。它仍然可以作为 Bot 自己 preset 里的工具。
- **把工作塞进目标 Bot 的 Dialogue**：会打乱 Owner 和这个 Bot 之间的对话，而且一个 Bot 同一时间只能做一件事。
- **直接安装 dsh-superagent-prototype**：它是研究代码，面向团队和单个 GitHub 仓库，版本钉在旧的 alpha，面板只能在 dsh 自己的 Web UI 里显示。
