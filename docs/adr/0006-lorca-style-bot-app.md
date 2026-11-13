---
status: accepted
supersedes: 0005 (Dialogue =（Bot, Workspace）的产品形态)
---

# 类 lorca 的桌面 Bot 应用

## 决定

产品收窄为一个**类 lorca 的桌面 Bot 应用**：左侧扁平的 Bot 列表，中间可平铺多个对话面板（**Pane**），每个 Bot 只有**一条长对话**，对话由按时间相连的**段**组成；Bot 详情从 Pane 顶部打开为弹窗；设置整页覆盖主区域。完整验收见 [specs/2026-11-13-bot-app](../specs/2026-11-13-bot-app.md)。

- **生活与工作域退场**：Mail / Task / Knowledge / Note / Spaces 的界面与文档定位移除；这些能力以后可由插件或 Bot 接入，不再是产品骨架。
- **一个 Bot 一条长对话**：**取代 [ADR 0005](0005-dialogue-on-dsh-workspace.md) 的「Dialogue =（Bot, Workspace）」**。段（Session）按时间相连，可以落在**不同的 dsh Workspace**；换工作目录开新段，旧段保留自己的目录。**注册表 v6 已把认领从 Dialogue 改成 Bot**：Bot 直接持有 `segments`（`sessionId` / `workspaceId` / 标题），最后一段是当前段；v3 / v4 / v5 文件在连上 Host 后迁移。
- **Pane 平铺保留**：横 / 纵再拆、拖动分隔线、关闭、⌘ 切换焦点、从列表把 Bot 拖进分屏区；**一个 Bot 同时只在一个 Pane 里**，再点它只切焦点；没有标签页。
- **Spaces 退场**：保存整套 Workbench 布局的快照不再是产品对象；布局随窗口恢复（客户端偏好），列表里不再有 Space 条目。
- **Bot 详情是弹窗**：Profile / Runs with / Skills / Plugins、默认工作目录、删除 / 归档，以及当前段的工作目录、模型、用量与 Compact 收进一个弹窗；Pane 内的侧抽屉 **Inspector** 退场。
- **设置整页覆盖**：⌘, 或底部 ⚙ 打开，覆盖分屏区；Esc 或「返回」回到原分屏布局，Pane 不变。分组（模型供应商 / 通用 / 后台 / 关于）在 L3 落地，本轮先嵌现有的后台服务内容。
- **归档是 Bot 的**：归档的 Bot 从左侧列表消失，搜索可找回并取消归档；归档不删除段与日志。
- **移动端与 Relay 仍是目标，本轮不实现**：手机是单栏——Bot 列表 → 长对话，Bot 详情为全屏页；经 Relay 连回桌面本机执行。
- **中英双语**（L4）与模型供应商 / 状态页（L3）在后续批次交付；长对话由 L2 交付。

## 考虑过的做法

- **继续 all-in-one**：域能力不是本轮的用户价值，却拖住了一个「好用的 Bot 应用」；域可以以后作为插件或 Bot 回来。
- **Bot 下继续分 Dialogue 列表页**：用户要的是一条连续的对话，不是先选项目再看会话；项目差异由段的工作目录表达，不再先选 Workspace。
- **每个 Bot 一个窗口**：Pane 平铺在同一窗口内已经满足「同时和多个 Bot 长线对话」；多窗口另案。
- **保留 Inspector 侧栏**：Pane 变窄后侧栏抢走对话宽度，而它讲的正是弹窗要讲的事。
- **保留 Spaces**：布局快照是 all-in-one 时代的组织方式；Pane 平铺 + 窗口恢复已覆盖保存布局的诉求。

## 后果

- Dialogue / Session 的导航、Spaces 的空壳分区、Inspector 与 Bot Panel 退场；`features/workspace` 继续拥有 dsh Workspace 投影，段直接引用 Workspace。
- 注册表 v6 的 Bot 持有 `segments`；段可跨 Workspace。v3 / v4 / v5 文件在连上 Host 后迁移：旧 Dialogue 的认领按文件顺序并成一条长对话，Workspace id 留在每段上，旧文件先备份。
- **迁移把旧段从 dsh 归档集合里取消归档**：产品没有段级归档，长对话必须完整；Bot 归档位仍是注册表字段（`Bot.archived`）。
- **不做**段级归档 / 删除、群聊、Pane 标签页与自定义模型供应商（spec Out of scope）。
- 界面文案仍是中英混合措辞，L4 统一。
- 手机目标形态记在 [BLUEPRINT](../BLUEPRINT.md)「多端（目标）」；配对与链路可靠性另案。
