---
status: superseded by 0005 for Dialogue name and archive
---

# Bot identity、Dialogue 名与归档是客户端注册表数据

> **Dialogue 名与归档已由 [ADR 0005](0005-dialogue-on-dsh-workspace.md) 取代**：名字是 dsh Workspace 的 title，归档是 Session 级的 dsh 归档集合。本文有效的部分只有 **Bot identity 归注册表**；下文 v4 字段描述的是该决定当时的文件形状。

## 决定

Bot 的 **identity**（accent 颜色 + 标记的形状与表情）、Dialogue 的 **name**、Dialogue 与 Session claim 的 **archived** 都写在客户端注册表（v4，`~/.myaid/registry/bots.json`），不写进 dsh Agent preset，也不写进 Session 事件日志。

注册表 v3 文件在读取时迁移：Bot 按 id 派生稳定 identity，Dialogue 的 name 读作 `null`（回落工作区段名），claim 的 archived 读作 `false`。dsh 继续是 Session、事件日志与 preset 正文的真源。

## 考虑过的做法

- **写进 Agent preset 的说明或正文**：preset 是能力组合，跨设备可见，但任何写入都需要一个官方 Remote；当前没有。把产品外观塞进能力面也会让 preset 变成第二份产品数据。
- **写进 Session metadata**：identity 属于 Bot、name 属于 Dialogue，二者都可能先于任何 Session 存在；Session 只覆盖一条上下文场景。
- **只放内存 / 客户端偏好**：注册表已经承担 Bot → Dialogue → Claim 的权威集合，identity 与归档跟对象同生命周期，放偏好会让对象与外观两处真源。

## 后果

- 本机即真源：同一注册表下，Navigator、对话、Panel 标签与 Inspector 的标记一致；删除注册表就丢失标记、名字与归档状态。
- **跨设备暂不同步**：移动端只读快照时看不到 identity / name / archive 的另一份写入；等 `dsh-bot-identity`（或 dsh Session metadata 面）落地再补同步，不先造第二套本地同步协议。
- 归档不是删除：dsh 的 Session 与日志保留，产品列表按注册表隐藏。
- 迁移只在读取时发生；`serializeRegistry` 之后文件即 v4。
