# Bot · 会话 · DSH 映射

对象边界与所有权对照。原则见 [BLUEPRINT](BLUEPRINT.md)，决定见 [ADR 0001](adr/0001-bot-has-many-sessions.md)，用词见根 [GLOSSARY](../GLOSSARY.md)。

## 一图总览

```mermaid
flowchart TB
  subgraph product["产品（桌面注册表）"]
    T["Bot template<br/>模板"]
    B["Bot<br/>启动身份"]
    C["认领 Claim<br/>sessionId · title · archived"]
    V["会话 Conversation<br/>一项对话任务"]
    T -->|"实例化"| B
    B -->|"1 : N"| C
    C -.->|"同一条"| V
  end

  subgraph dsh["DSH（官方 dsh web）"]
    P["Agent preset"]
    S["Harness Session<br/>事件日志"]
    W["web profile<br/>唯一后台"]
    P --- W
    S --- W
  end

  T -->|"presetId"| P
  B -->|"bound / derived preset"| P
  C -->|"sessionId 1 : 1"| S
  B -->|"workspace · 默认模型"| S
```

要点：

| 产品         | DSH                                    | 关系                                           |
| ------------ | -------------------------------------- | ---------------------------------------------- |
| Bot template | Agent preset id                        | 模板映射 preset；不是 preset 正文快照          |
| Bot          | 共用 `web` profile 上的一个启动 preset | 初始化绑定模板 preset；单独配置后用派生 preset |
| 会话         | 一条 Harness Session                   | 严格一对一                                     |
| 认领         | Session id 的归属                      | 写在注册表；日志仍在 dsh                       |
| （无）       | 未认领 Session                         | 不进入产品列表                                 |

## Profile 与 Preset

二者都在 DSH 侧，层级不同：

|            | **Profile**                                       | **Agent preset**                                   |
| ---------- | ------------------------------------------------- | -------------------------------------------------- |
| 是什么     | 一次 `dsh` 进程的**装配单元**（插件集、进程服务） | 该进程里某个 Agent 的**启动组合**（工具 / 指令等） |
| MyAid 用法 | 全体 Bot **共用**官方 `web` profile               | 每个 Bot 选一个 preset id（模板绑定或派生）        |
| 数量       | 一个后台、一个 profile                            | 同一 profile 上可有多个 preset                     |
| 谁持有正文 | profile 装配在 dsh / Host 启动参数                | preset 正文在 dsh；注册表只存 id                   |

```mermaid
flowchart TB
  host["Host 启动唯一 dsh"]
  web["web profile<br/>进程级装配"]
  host --> web
  web --> p1["preset: standard"]
  web --> p2["preset: minimal"]
  web --> p3["preset: bot 派生"]
  p1 --> b1["Bot A 的会话"]
  p2 --> b2["Bot B 的会话"]
  p3 --> b3["Bot C 的会话"]
```

- **不**按 Bot 拆 profile 或 dsh 进程。
- Bot 差异落在 **preset**（及工作区 / 默认模型）上，不落在 profile 上。
- 产品插件经 patch / bundle 装进这个共用的 `web` profile；「每 Bot 能力」用派生 preset，不用第二套 profile。

## 身份与能力

```mermaid
flowchart LR
  tmpl["模板当前 presetId"]
  bound["Bot.boundPresetId<br/>初始化时绑下"]
  derived["Bot.derivedPresetId<br/>单独配置"]
  resolve["启动用的 preset"]
  tmpl -->|"草稿跟随"| resolve
  bound -->|"已绑定"| resolve
  derived -->|"优先"| resolve
  resolve --> create["session.create<br/>agentPreset + cwd"]
```

- 能力、默认模型、工作区属于 **Bot**，不按会话另存。
- 改能力：立刻更新派生 preset；正在跑的一轮不打断；空闲后同一 Session id 用新 preset 恢复。

## 认领与生命周期

```mermaid
stateDiagram-v2
  [*] --> Draft: 新建 Bot
  Draft --> Ready: 初始化<br/>（绑 preset，冻模板/工作区）
  Ready --> Ready: 新建会话 → 认领
  Ready --> Ready: 归档认领
  Ready --> Ready: 待核对后解除认领
  Draft --> [*]: 删除<br/>（从未认领过）
  note right of Ready
    hadSession 一旦为真不能删 Bot
    会话本身不删除
  end note
```

```mermaid
sequenceDiagram
  actor U as 用户
  participant UI as Client
  participant Reg as 注册表
  participant DSH as dsh web

  U->>UI: 进入就绪 Bot → 新建任务
  UI->>DSH: session.create(cwd, agentPreset)
  DSH-->>UI: sessionId
  UI->>Reg: claimSession(botId, sessionId)
  Note over UI: Bot 视图 / 会话视图<br/>都读同一份认领
  U->>UI: 归档
  UI->>Reg: archived = true
  Note over DSH: Session 与日志保留
```

## 两个视图，同一份认领

```mermaid
flowchart TB
  claims[(注册表认领)]
  bots["Bots 模块<br/>按 Bot 看它的会话列表"]
  chat["Dialogue 模块<br/>跨 Bot 看全部已认领会话"]
  claims --> bots
  claims --> chat
  bots <-->|"可进到对方"| chat
```

- 新建任务只挂在某个就绪 Bot 上；跨 Bot 列表不新建。
- 未认领的 Session（含历史 `myaid-primary`）两边都不展示。

## 真源分工

```mermaid
flowchart LR
  subgraph registry["桌面注册表 ~/.myaid/registry"]
    R1[模板 / Bot 配置]
    R2[认领]
  end
  subgraph harness["dsh / 上游 settings"]
    H1[Session 事件日志]
    H2[模型凭据 · 端点]
    H3[Agent preset 正文]
  end
  R2 -->|"sessionId"| H1
  R1 -->|"preset id"| H3
```

| 真源       | 持有                                      |
| ---------- | ----------------------------------------- |
| 桌面注册表 | 名称、模板引用、工作区、默认模型、认领    |
| dsh        | Session 日志、执行状态、preset 正文、凭据 |
| Host       | dsh 生命周期与连接发现；不写业务会话权威  |

## 执行占用（按工作区路径）

```mermaid
flowchart TB
  path["同一绝对工作区路径"]
  s1["会话 A 执行中"]
  s2["会话 B"]
  path --> s1
  path --> s2
  s2 -->|"可看历史 / 可新建"| ok["允许"]
  s2 -->|"开始执行"| wait["等占用释放<br/>否则 session/conflict"]
```

路径不同的 Bot 可以各跑一条。产品不要求路径在 Bot 之间唯一。
