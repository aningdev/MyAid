# Bot · Dialogue · Session · DSH 映射

对象边界与所有权对照。原则见 [BLUEPRINT](BLUEPRINT.md)，决定见 [ADR 0001](adr/0001-bot-has-many-sessions.md)、[ADR 0005](adr/0005-dialogue-on-dsh-workspace.md) 与 [ADR 0006](adr/0006-lorca-style-bot-app.md)，用词见根 [GLOSSARY](../GLOSSARY.md)。

> **修订（ADR 0006）**：目标形态是**一个 Bot 一条长对话**，段（Session）可以落在不同的 dsh Workspace；本文的 **Dialogue 层是 L1 的过渡数据模型**（注册表 v5），L2 把认领从 Dialogue 改成 Bot 并迁移 v5 数据。界面在 L1 对一个 Bot 只显示它最近的一条 Session。

## 一图总览

```mermaid
flowchart TB
  subgraph product["产品注册表"]
    T["Bot template"]
    B["Bot<br/>联系人 · 派生 Preset"]
    D["Dialogue<br/>{ botId, workspaceId }"]
    C["Claim<br/>sessionId → dialogueId"]
    T -->|"实例化"| B
    B -->|"1 : N"| D
    D -->|"1 : N Session"| C
  end

  subgraph dsh["DSH（dsh web / web profile）"]
    P["Agent preset"]
    W["Workspace<br/>path · title · sessionIds<br/>pins · archive"]
    S["Session<br/>事件日志"]
    P --- W
    W -->|"有序账本"| S
  end

  T -->|"presetId"| P
  B -->|"bound / derived preset"| P
  D -->|"workspaceId"| W
  C -->|"sessionId 1 : 1"| S
```

要点：

| 产品             | DSH                              | 关系                                                               |
| ---------------- | -------------------------------- | ------------------------------------------------------------------ |
| Bot template     | Agent preset id                  | 模板映射 preset；非正文快照                                        |
| Bot              | 共用 `web` profile 上启动 preset | 能力 = preset（`plugins`：指令、工具、skills、可选 MCP…）          |
| Dialogue         | **一个 Workspace 的一个视角**    | L1 过渡：`workspaceId`；L2 改成段直接引用 Workspace                 |
| Session / 会话   | 一条 Harness Session             | 严格一对一；一个上下文场景                                         |
| Claim            | Session 认领到 Dialogue          | 写在注册表；日志仍在 dsh                                           |
| Dialogue 名      | Workspace `title`                | 重命名 = `workspace.rename`；同一 Workspace 上共享                 |
| Session 归档     | Workspace `archived set`         | 运行中被 `workspace/session-active` 拒绝，可 `stopActivity`        |
| 置顶             | Workspace `pinned sessionIds`    | 最近置顶在前；L1 的界面不再显示段级置顶                            |
| Session 顺序     | Workspace `sessionIds`           | 新建前插、手动重排；顺序归 dsh                                     |
| Deliverable      | DSH Deliverable                  | 投影某 Session 场景内交付物；Dialogue 可累积多个                   |
| （无）           | 未认领 Session                   | 不进入产品列表                                                     |

基数：**Bot 1—N Dialogue**；**Workspace 1—N Dialogue**（同一 Bot 对同一 Workspace 只开一段）；**Dialogue 1—N Session**。

## Profile 与 Preset

|            | **Profile**                         | **Agent preset**                                             |
| ---------- | ----------------------------------- | ------------------------------------------------------------ |
| 是什么     | 一次 `dsh` 进程的装配单元           | 该进程里某个 Agent 的子插件组合（`id` + `plugins`）          |
| MyAid 用法 | 全体 Bot **共用**官方 `web` profile | 每个 Bot 一个 preset id（模板绑定或派生）                    |
| 数量       | 一个本机执行面、一个 profile        | 同一 profile 上可有多个 preset                               |
| 谁持有正文 | profile 装配在 dsh / Host           | profile preset 在 dsh；Bot 派生 preset 在插件；注册表只存 id |

```mermaid
flowchart TB
  host["Host 启动 dsh web"]
  web["web profile"]
  host --> web
  web --> p1["preset: standard"]
  web --> p2["preset: bot 派生"]
  p1 --> d1["Bot A · Dialogue · Workspace 项目甲"]
  p2 --> d2["Bot A · Dialogue · Workspace 项目乙"]
  p2 --> d3["Bot B · Dialogue · Workspace 项目甲"]
```

- **不**按 Bot 拆 profile 或 dsh 进程。
- Bot 差异落在 **preset**；项目/目录差异落在 **Workspace / Dialogue**。
- 产品口语 **Runner** = 本机 `dsh web` / web profile，**不是** DSH 专名。

## 身份与能力

```mermaid
flowchart LR
  tmpl["模板当前 presetId"]
  bound["Bot.boundPresetId"]
  derived["Bot.derivedPresetId"]
  resolve["启动用的 preset"]
  tmpl -->|"草稿跟随"| resolve
  bound -->|"已绑定"| resolve
  derived -->|"优先"| resolve
  resolve --> create["session.create<br/>workspaceId + agentPreset"]
```

- 能力、默认模型属于 **Bot**（preset）。
- **Workspace** 属于 dsh；Dialogue 只持有它的 id。`session.create` 用 `workspaceId`（dsh 解析 cwd、建好后 attach），不再传 cwd。
- 改能力：更新派生 preset；正在跑的一轮不打断。派生正文由 `myaid-plugin-bot-presets` 拥有并注册进官方 registry；改完后**新建**的 Session 用新组合，已存在的 Session 保留它已持有的组合。

## 认领与生命周期

```mermaid
stateDiagram-v2
  [*] --> Draft: 新建 Bot
  Draft --> Ready: 初始化（绑 preset）
  Ready --> Ready: 新 Workspace → 新 Dialogue
  Ready --> Ready: Dialogue 内新建 Session → Claim
  Ready --> Ready: 归档 / 取消归档 Session（dsh）
  Ready --> Ready: Archive Dialogue（逐条 Session 归档）
  Ready --> Ready: Remove Dialogue（仅当其没有 Session）
  Ready --> Ready: 置顶 / 取消置顶 Session（dsh）
```

```mermaid
sequenceDiagram
  actor U as 用户
  participant UI as Client
  participant Reg as 注册表
  participant DSH as dsh web

  U->>UI: 就绪 Bot → 新 Dialogue（选目录）
  UI->>DSH: workspace.create(path)
  DSH-->>UI: workspaceId（同规范路径返回既有）
  UI->>Reg: createDialogue(botId, workspaceId)
  U->>UI: 在 Dialogue 内开聊 / 新上下文
  UI->>DSH: session.create({ workspaceId, agentPreset })
  DSH-->>UI: sessionId（已 attach 进 Workspace）
  UI->>Reg: claimSession(dialogueId, sessionId)
  U->>UI: 归档这条 Session
  UI->>DSH: workspace.archiveSession(sessionId)
  DSH-->>UI: 归档集合（运行中则 workspace/session-active）
  Note over DSH: Session 与日志保留；界面的 follow 帧更新列表
```

## 两个视图

```mermaid
flowchart TB
  claims[(注册表 Claim)]
  ws[(dsh Workspace<br/>title · 顺序 · 置顶 · 归档)]
  bots["Bots<br/>按 Bot → Dialogue 列表"]
  chat["Dialogue 模块<br/>进入某 Dialogue → Session"]
  claims --> bots
  claims --> chat
  ws --> bots
  ws --> chat
```

- 新建 Dialogue / Session 只挂在某个就绪 Bot 上。
- 未认领 Session 不展示；被 dsh 归档的 Session 也不展示（Dialogue 面板留「已归档」入口可 Unarchive）。会话全部归档的 Dialogue 从 Bots 与 Dialogues 的活跃列表落进 Dialogues 分区的「已归档」组。

## 真源分工

| 真源       | 持有                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| dsh        | Session 日志与执行状态、Workspace（path / title / 顺序 / 置顶 / 归档）、preset 正文、凭据、Deliverable 相关事件/摘要 |
| 桌面注册表 | Bot、Dialogue（botId + workspaceId）、Claim、模板引用、模型偏好、Bot 默认工作区                                      |
| 客户端偏好 | Navigator 宽度 / 折叠、Workbench 布局、非 Session 的 Favorites 地址                                                  |
| 插件       | 派生 preset 正文与技能副本（`myaid-plugin-bot-presets`，`$DSH_HOME`）                                                |
| Host       | dsh 生命周期与连接发现；不写业务 Dialogue/Session 权威                                                               |

## 执行占用（按 Workspace）

同一 **Workspace** 同时只有一条 Session 可执行；其它 Session 可看历史 / 可新建，开始执行须等占用释放。不同 Workspace 的 Dialogue 可以各跑一条。两个 Bot 看同一目录即同一 Workspace，因此它们在该目录上互斥。
