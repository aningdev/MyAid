# MyAid 术语表

定义 MyAid 产品概念，并区分 DeepSeek Harness 的执行概念。英文用于类型与接口，中文用于解释。产品概念不改变上游同名概念的含义。

命名桶：**A** 沿用 DSH 名 · **B** 产品别名并映射 DSH · **C** MyAid 自有（禁止与 DSH 抢英文名）。对照与基数见 [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。

## 产品与运行时

**MyAid（个人助手）**：类 lorca 的桌面 Bot 应用：以 `dsh` 为能力底座、以 NSH 为多端壳，管理一组 **Bot** 并同时和多个 Bot **长线对话**。每个 Bot 只有**一条长对话**，由按时间相连的**段**组成。运行拓扑为**一台桌面为本、数据与操作在本地、多端可链接**。  
_Avoid_：all-in-one 生活与工作域套件、单点聊天客户端、DeepSeek 品牌 Web GUI、每助手一套执行引擎、每台手机自带执行后台、以云同步目录为权威真源

**Bot（助手 · 联系人）** _[C]_：桌面注册表中的助手档案。能力真源是全体助手共用的 `web` profile 上**恰好一个**（常派生的）**Agent preset**：指令 / 人设、插件、MCP、skills 等经 preset 的 `plugins` 增删改。名下**只有一条长对话**；归档位在注册表。  
_Avoid_：live Agent、Profile 别名、每助手一套 dsh 进程、按项目拆出多条对话、域对象本身

**Bot template（模板）** _[C]_：稳定的产品模板 ID，映射到一个 DSH Agent preset id。不是 preset 正文快照；未初始化的 Bot 跟随模板当前的 preset id。

**Dialogue（对话 / 长对话）** _[C]_：与某个 Bot 的一段长线交往 = **该 Bot 的一条长对话**。其下按时间相连的**段**（Session）；换工作目录开新段，不把对话按 Workspace 拆成多条。本轮注册表仍以 Dialogue + Claim 记录，L2 改为段直接属于 Bot（[ADR 0006](docs/adr/0006-lorca-style-bot-app.md)）。  
_Avoid_：DSH Session、一个 Bot 多条 Dialogue、在注册表里另存一份路径 / 名字

**长对话（Long conversation）** _[C]_：一个 Bot 的全部历史 = 按时间相连的段；界面上可沿右侧历史轨逐段翻阅。  
_Avoid_：把每个 Workspace 当成一条对话、把长对话等同于一条 Session

**段（Segment）** _[C]_：长对话里按时间相连的一段 = 一条 dsh Session；有日期与工作目录。只有最新段可发送；接近上下文上限时在段内 Compact，不自动新开段。段的单独归档 / 删除不在本轮。  
_Avoid_：把段当产品对象另存、把 Workspace 当段、把段级归档当成已交付

**Session（会话）** _[A]_：一条 Harness Session（事件日志真源）；在长对话里它就是**段**。须经注册表认领到某个 Bot 才进入产品。  
_Avoid_：Dialogue、广义 Task、未认领的 Harness Session

**认领（Claim）** _[C]_：注册表中「一条 Session 属于哪个 Bot」的记录；除了这层归属，只保留人对它的称呼。L1 的认领仍挂在 Dialogue 上，L2 改成 Bot。  
_Avoid_：把认领写进 dsh 事件日志、把顺序 / 置顶 / 归档写进 Claim

**归档（Archive）** _[A]_：归档 **Bot**：注册表标记，它退出左侧列表，搜索可找回并取消归档；段、日志与 dsh 的 Workspace 都保留。归档不删除 Bot。段的单独归档 / 删除不在本轮。  
_Avoid_：删除 Session 日志、在注册表另存段级归档、用归档代替删除

**Workspace（工作区）** _[A]_：dsh 拥有的目录对象：规范路径、名字、Session 的先后顺序、置顶集合与归档集合。产品只引用它、经官方接口读写，不另存一份。Bot 的**默认工作目录偏好**属于注册表（下一段建议的路径）。  
_Avoid_：把 Workspace 当产品对象另存一份、用 workspace 泛指 Pane、在段之间来回改工作目录

**Deliverable（交付产物）** _[A/B]_：某一 **段** 场景内的交付物（对齐 DSH 当轮/场景 Deliverable：如 present、工作区变更摘要）。一条长对话可累积多个。产品可加元数据（标题、置顶）；正文真源不另建第二套去抢 Session 日志。  
_Avoid_：Outcome（已弃用）、把 Deliverable 当成跨域长期「事情结果」档案

**Registry（注册表）**：Bot、L1 的 Dialogue / Claim 与偏好等产品配置的权威集合，桌面独占写入。Session 事件日志在 dsh。

**Profile（装配单元）** _[A]_：Harness 命名运行组合；多个 Bot 共用一个 `web` profile。  
_Avoid_：每助手一个 profile、每助手一个执行进程

**Runner** _[B]_：**产品口语**，指本机上以 **`web` profile** 运行的官方执行面（即 `dsh web` / `dsh --profile web`）。**不是** DSH glossary / 架构中的正式专名；正式文档优先写 `dsh web` 或 web profile。  
_Avoid_：写成上游专有名词、与 Host / Background Service / Agent 混称

**Background Service（后台服务）**：已向 OS 登记、可脱离 UI 常驻的一个进程单元。当前实例是 Host 与 Relay。  
_Avoid_：Runner、用裸「后台」兼指执行面与 OS 服务、把 Host 与 Relay 合成一个服务身份

**Background（产品后台）**：Client 暴露的产品能力：查询并在用户明确启用后编排 Host 与 Relay 两个 Background Service，使**桌面本机**在无窗体时仍可被多端链接、继续本地执行；停止后台只作用于两服务的运行/登记意图。  
_Avoid_：把「后台」当成产品目标本身（目标是桌面为本 + 本地 + 可连）、与 Runner/`dsh web` 混称、把停止后台当成删 Registry / 停 Session / 清 Data root

**Host（本机宿主）**：一个 Background Service；拥有 `dsh web` 生命周期、连接发现与 Bridge。  
_Avoid_：ProductService、统一聊天接口、权威会话存储、Relay

**Client（交互客户端）**：NSH 桌面（及未来移动）应用；桌面写注册表，移动端只读快照。

## Client 壳

**Workspace Shell（工作区壳）** _[C]_：Client 桌面交互壳 = **左侧可收缩 Navigator** + **右侧 Workbench**（分屏区）；不拥有域数据。  
_Avoid_：左侧图标轨 SideNav、旧 AppShell / 单 Module 整页挂载、与 dsh Workspace 混名

**Navigator（导航）** _[C]_：左侧可调宽、可收缩的**扁平 Bot 列表**：搜索框、**Pin** 区、其余 Bot 按最近活动排序（工作中的点、未读数）、「＋ 新建 Bot」；底部是 Host 状态与设置入口。没有分区、没有树、不在 Bot 下展开会话。  
_Avoid_：多级树、按域分区（Mail / Task / Dialogues / Spaces）、把列表当成第二套模型、把 Navigator 当成已打开 Pane 的清单

**Pin（置顶）** _[C]_：把 Bot 固定在列表顶部的**客户端偏好**（按置顶顺序）；取代旧的 **Favorites**。段级置顶不是产品对象。  
_Avoid_：Favorites、dsh 的 Session 置顶、Space

**Pane（对话面板 · 分屏格）** _[C]_：分屏区内一块可聚焦的面板，显示一个 Bot 的长对话；可横 / 纵再拆、拖动分隔线调整大小、关闭、⌘ 切换焦点、从列表拖入；**一个 Bot 同时只在一个 Pane 里**，再点它只切焦点。没有标签页。  
_Avoid_：Tab、Window（易与 OS 窗混淆）、把 Pane 当成域对象

**Workbench（工作台）** _[C]_：右侧可调宽栏内的 Pane 布局（`DockArea` center）；设置覆盖层盖住它，Pane 不因此改变。  
_Avoid_：裸名 Workspace（易与 DSH Workspace 混淆）、固定宫格、本阶段多窗多台

**Bot identity mark（Bot 标记）** _[C]_：Bot 的视觉身份——一个 accent 颜色加一个几何 glyph，出现在 Navigator、Pane 标题、对话与创建 / 详情流程。属于注册表数据，不是 dsh preset 正文。  
_Avoid_：角色画 / 头像上传、把标记塞进 Agent preset、把颜色当能力

**Bot details（Bot 详情）** _[C]_：Pane 顶部（与拆分 / 关闭控件并排）打开的**弹窗**：Profile / Runs with / Skills / Plugins、默认工作目录、删除 / 归档，以及当前段的工作目录、模型、用量 / 上下文与 Compact。改的是注册表偏好；能力仍是那个 **Agent Preset**。  
_Avoid_：第二个 Bot 编辑器页、Pane 内的侧抽屉 Inspector、把 preset 正文写进注册表、把全局插件开关伪装成每 Bot 差异

**Settings（设置）** _[C]_：整页覆盖分屏区的设置：模型供应商 / 通用 / 后台 / 关于；Esc 或「返回」回到原分屏布局，Pane 不变。  
_Avoid_：把设置做成 Navigator 分区或一个 Pane、在设置里改注册表以外的东西

**Model provider（模型供应商）** _[A]_：dsh 的模型路由与它的设置命名空间。设置页只列 dsh 报告的供应商；API Key 经 `credentials` Remote 写入 dsh 的凭据存储，base URL 等字段与默认模型经 `settings` Remote 写入 dsh 的设置文档。MyAid 不保存 Key，也不在本轮添加自定义供应商。  
_Avoid_：把供应商清单或字段硬编码进 Client、把 Key 写进 `~/.myaid`、用注册表存供应商设置

**Plugin（插件）** _[A]_：Cordis / 声明式 bundle 装配的能力包（`packages/myaid-plugin-*` 或上游插件）。可进入共用 `web` profile 或某 Bot 派生 preset 的 `plugins`。

**Relay**：一个 Background Service；多端密文帧转发；不持 owner 凭据。  
_Avoid_：Bridge、持有凭据的网关、Host 子进程（默认存活模型）

**Bridge**：Host 内的设备授权与官方协议转发面。  
_Avoid_：Relay、产品后台入口、替代 `dsh web`

**Data root（数据根）**：产品本地数据目录，约定 `~/.myaid`（`DSH_HOME`）。

**Generation**：Host 为每次新 dsh 子进程分配的世代标识；连接换代后旧回调失效。

**HostControl**：Host 的本机控制通道协议与服务；查询/登记事实与 `dsh web` 生命周期管理；不承载业务 remote。  
_Avoid_：RelayControl、业务 Remote

**RelayControl**：Relay 的本机控制通道协议与服务；查询/登记事实与就绪状态；不承载业务 remote，不解密载荷。  
_Avoid_：HostControl、把 Relay 启停塞进 HostControl

**TurnProjection**：Client 内把官方 Session **事件窗口**（`SessionEventLikeEntry` 连续窗口 + 每个 generation 的原子替换）与本地 prompt 生命周期投影为 Dialogue UI 消息 / live 气泡 / freeze 策略的 module；每个 **SessionController** 持有一个。  
_Avoid_：ChatPane 内二次解析事件、独立 SessionProjector 对外接口、在视图里维护第二份窗口

**SessionController**：按 Session 的运行时 module：从官方 `ctx.sessions` 的一个 Session binding 读运行态与事件窗口（follow / 分页 / 重连 / prompt·queue·cancel 状态都归官方 client model），自己只持有产品新增的部分——**TurnProjection**、草稿与附件、审批展示、每个 Pane 的视图；对外提供 prompt / queue / withdraw / cancel / loadOlder。由 registry 按 sessionId 惰性创建，无 Pane 且未运行、无待审批、草稿已清空时释放（释放延迟一个 tick，避免 Pane 重渲染时拆掉官方本地 generation），运行中的留在后台把回复跑完。  
_Avoid_：全局单例 runtime、ChatPane 自持帧解析、把 controller 当产品对象、把草稿或附件放回 Pane（切走会丢）、在 controller 里自建 follow / 重连 / 回执映射

**ClaimedSession**：认领 Session 的客户端 module：一条共享 Connection（含它装上的一代官方 client model）、create + claim、dispose；产品路径不创建未认领 Session。Session 运行态与审批路由属 **SessionController** 与官方 `ctx.sessions`。（实现名；认领目标应对齐 Bot——见映射图。）  
_Avoid_：`myaid-primary`、未认领的固定 Session、把连接复制到每个 controller

**SessionRoster**：产品 Session 名册 module：认领 × dsh listing × 摘要 → 列表行，再把 **SessionController** / 未读状态投影到行；未认领不进列表。  
_Avoid_：在 List/Main 内拼装行模型、把状态点做成第二套会话模型

## Harness 概念（上游，桶 A）

**Session**：Harness 持久执行会话与事件日志。产品 **Session（会话）** 与此同名同物，须认领到某个 Bot。  
**Agent / AgentHandle**：进程内执行实例与销毁权。Bot ≠ Agent。  
**Agent Preset**：声明式 Agent 能力组合（顶层主要为 `id` + `plugins`）；人设、工具、skills、可选 MCP 客户端行等经子插件进入。Bot 的能力真源。Permission preset 是另一概念。  
**Profile**：部署级 Cordis 具名组装（如 `web`）。  
**Remote**：插件向客户端暴露的公开调用面。  
**Goal / Todo / Job / Workspace / Deliverable…**：上游专有含义见 DSH 文档；产品生活域不抢用 Goal/Todo 英文名；产品 Deliverable 对齐上游当轮交付物语义。
