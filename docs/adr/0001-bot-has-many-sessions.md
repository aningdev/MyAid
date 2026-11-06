---
status: accepted
superseded_note: 原则仍有效；对象层级已扩展为 Bot → Dialogue → Session。实现与注册表迁移前以 [BLUEPRINT](../BLUEPRINT.md) 与 [BOT_SESSION_MAP](../BOT_SESSION_MAP.md) 为准。
---

# 一个 Bot 多条执行上下文（Dialogue / Session）

## 原决定（仍成立的部分）

Bot 曾被定义成唯一一条持续会话。产品要在同一 Bot 下并行多条执行上下文，因此 Bot 改为全体助手共用的 `web` profile 上的启动身份（能力 = Agent preset）；其下每条 **Session** 一对一对应一条 Harness Session，由桌面注册表认领。dsh 继续保存事件日志。Session 不是生活域 Task。

## 修订（命名与层级）

在「Bot 下多条 Harness Session」之上增加产品对象 **Dialogue**：

| 对象         | 角色                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Bot**      | 联系人式档案；能力真源 = 一个（常派生的）Agent preset                                            |
| **Dialogue** | 与该 Bot 的一段长线对话；绑定一个 workspace path；**1 Bot : N Dialogue**（如 coding bot 多项目） |
| **Session**  | Dialogue 内的一个上下文场景 = 一条 DSH Session；**1 Dialogue : N Session**                       |
| **Claim**    | Session → Dialogue                                                                               |
| **Archive**  | 默认归档 Dialogue；其下 Session 退出活跃入口；不删 dsh 日志                                      |

连续聊默认同一 Session；显式「新上下文」才新 Session。产品口语 **Runner** = `dsh web` / web profile，非 DSH 专名。

## 考虑过的做法

- 维持一 Bot 一 Session。执行状态不会被新上下文掩盖，但多上下文无法并存。
- 一条上下文拆成多条 Harness Session，或多上下文共用一条 Session。边界会和官方日志错位，所以 Session 与 Harness Session 仍严格一对一。
- 按 Bot 拆进程或 profile。与 DSH 原则冲突。能力放在 Bot 的 preset 上。
- 一 Bot 一 Dialogue。无法表达同一助手在多项目工作区上的并行长线；改为 1 : N Dialogue，工作区挂在 Dialogue。

## 后果

同一 workspace path 同时只执行一条 Session。归档默认落在 Dialogue。Bot 视图与 Dialogue / Session 视图读同一份注册表。广义 Task 等生活域不是 Session。Deliverable 对齐 DSH 场景交付物，长 Dialogue 可有多个。

映射图见 [BOT_SESSION_MAP](../BOT_SESSION_MAP.md)。
