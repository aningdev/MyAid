# MyAid 术语表

定义 MyAid 产品概念，并区分 DeepSeek Harness 的执行概念。英文用于类型与接口，中文用于解释。产品概念不改变上游同名概念的含义。

命名桶：**A** 沿用 DSH 名 · **B** 产品别名并映射 DSH · **C** MyAid 自有（禁止与 DSH 抢英文名）。对照与基数见 [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。

## 产品与运行时

**MyAid（个人助手）**：all-in-one 个人助手产品：以 `dsh` 为能力底座、以 NSH 为多端壳，用 **Bot** 与 **Dialogue** 连接邮件、广义 Task、知识、笔记等生活与工作域。运行拓扑为**一台桌面为本、数据与操作在本地、多端可链接**。  
_Avoid_：单点聊天客户端、DeepSeek 品牌 Web GUI、每助手一套执行引擎、每台手机自带执行后台、以云同步目录为权威真源

**Life domain / 生活工作域**：Mail、广义 **Task**、Knowledge、Note 等一等公民对象集合；有独立生命周期，**不是** Session / Bot / Dialogue。经 Bot + Dialogue 引用与驱动。细模型按域另定。  
_Avoid_：把域数据写进 Session 事件日志冒充产品存储、把 Task 当成 Session、产品英文抢用 DSH **Goal** / **Todo**

**Task（任务，广义）** _[C]_：生活域伞概念——临时事项、周期工作、长期目标；可勾选、可拆解；用 kind / 状态区分。完成用 Task 状态，不另造 Outcome。  
_Avoid_：DSH Goal、DSH Todo、Session、Dialogue

**Mail / Note / Knowledge** _[C]_：邮件、笔记、知识；一等公民。细模型另定。

**Bot（助手 · 联系人）** _[C]_：桌面注册表中的助手档案。能力真源是全体助手共用的 `web` profile 上**恰好一个**（常派生的）**Agent preset**：指令 / 人设、插件、MCP、skills 等经 preset 的 `plugins` 增删改。名下 **1 : N Dialogue**。  
_Avoid_：live Agent、Profile 别名、每助手一套 dsh 进程、唯一一条 Dialogue、域对象本身

**Bot template（模板）** _[C]_：稳定的产品模板 ID，映射到一个 DSH Agent preset id。不是 preset 正文快照；未初始化的 Bot 跟随模板当前的 preset id。

**Dialogue（对话）** _[C]_：与某个 Bot 的一段长线交往 = **该 Bot 对某个 dsh Workspace 的视角**。其下 **1 : N Session**（多上下文场景）。换项目工作区 → 新 Dialogue；两个 Bot 看同一目录 → 两个 Dialogue、一个 Workspace。名字就是该 Workspace 的名字（跨 Bot 共享）。  
_Avoid_：DSH Session、把「会话」当 Dialogue 的中文、一个 Bot 强制只有一条 Dialogue、在注册表里另存一份路径 / 名字

**Session（会话）** _[A]_：一个**上下文场景**；产品与 DSH 同名，一对一等于一条 Harness Session（事件日志真源）。连续聊默认同一 Session；显式「新上下文」才新建。须经注册表认领到某 Dialogue 才进入产品。  
_Avoid_：Dialogue、广义 Task、未认领的 Harness Session

**认领（Claim）** _[C]_：注册表中「一条 Session 属于哪个 Dialogue」的记录（Dialogue 已属 Bot）；除了这层归属，只保留人对它的称呼。顺序、置顶与归档属于该 Dialogue 所指的 dsh Workspace。  
_Avoid_：Session 直接认领到 Bot 而跳过 Dialogue、dsh 事件日志、把归档 / 置顶写进 Claim

**归档（Archive）** _[A]_：把 Session 收进 dsh 的归档集合；它退出产品的列表，历史与日志保留。仍在执行的 Session 不能直接归档：界面给出 **Stop and archive**，先停掉那轮工作再归档。**Archive Dialogue** 归档该 Dialogue 认领的全部 Session；Dialogue 自身没有独立的归档标记——会话都归档了，它就是归档的。不删除 Bot。  
_Avoid_：删除 Session 日志、把归档当成停用 Bot、在注册表另存归档字段、用归档代替删除

**Workspace（工作区）** _[A]_：dsh 拥有的目录对象：规范路径、名字、Session 的先后顺序、置顶集合与归档集合。产品只引用它、经官方接口读写，不另存一份。Bot 的**默认工作区偏好**属于注册表（下次开 Dialogue 的建议路径）。  
_Avoid_：把 Workspace 当产品对象另存一份、用 workspace 泛指 Space / Workbench、在 Dialogue 上来回改工作目录

**Deliverable（交付产物）** _[A/B]_：某一 **Session** 场景内的交付物（对齐 DSH 当轮/场景 Deliverable：如 present、工作区变更摘要）。一条长 Dialogue 可累积多个。产品可加元数据（标题、置顶、挂 Task）；正文真源不另建第二套去抢 Session 日志。  
_Avoid_：Outcome（已弃用）、把 Deliverable 当成跨域长期「事情结果」档案

**Registry（注册表）**：Bot / Dialogue / Claim 等产品配置的权威集合，桌面独占写入。Session 事件日志在 dsh。

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

**Workspace Shell（工作区壳）** _[C]_：Client 桌面交互壳 = **左侧可收缩 Navigator** + **右侧 Workbench**；不拥有域数据。  
_Avoid_：左侧图标轨 SideNav、旧 AppShell / 单 Module 整页挂载、与 dsh Workspace 混名

**Navigator（导航树）** _[C]_：左侧可调宽多级树（`nsh/base` Tree），可收缩只留顶部拖拽条；节点是导航地址投影（**去哪里**的目录，不是已打开内容的清单）。由若干 **Navigator Section** 纵向组成（固定顺序）：Favorites、Mail、Task、Knowledge、Bots、Dialogues、Spaces、Settings。  
_Avoid_：手写树行、DockArea left dock、把树当成第二套域模型、顶层根名叫 Pin、把 Navigator 当成已打开 Panel 列表

**Navigator Section（导航分区）** _[C]_：Navigator 的一个顶层分组；以分区标题呈现，可整体折叠，其下是该域的可展开树。集合与顺序固定。  
_Avoid_：区块 / Block（Rex 中 block 指 pane，易与 Panel 混淆）、Module、Space

**Favorites（收藏）** _[C]_：Navigator 顶层分区；**Session 行就是 dsh 的置顶会话**（最近置顶在前），其余 Nav address（Bot / Dialogue / Settings）的快捷入口存客户端偏好。  
_Avoid_：Pin（留给各树内置顶）、Space、把 Session 置顶写进客户端偏好

**Space（空间）** _[C]_：已保存的 Workbench 布局快照（DockArea center 切分树 + 各 Panel 的 Nav address）；打开替换 Workbench。  
_Avoid_：裸名 Workspace、Window（易与 OS 窗混淆）、Favorites

**Workbench（工作台）** _[C]_：右侧可调宽栏内的多面板区（`DockArea` center）；独立 Panel 可拖、拆、缩放、放大、关闭。  
_Avoid_：裸名 Workspace（易与 DSH Workspace 混淆）、固定宫格、本阶段多窗多台

**Panel（面板）** _[C]_：Workbench 内一块可聚焦的内容宿主；持有一个导航地址（或空插槽）。  
_Avoid_：Module 整页独占、把 Panel 当成域对象

**Nav address（导航地址）** _[C]_：Navigator 节点与 Panel 内容的稳定身份（域根 + 路径 + 对象引用）；激活叶子默认替换活动 Panel 的地址，同地址则聚焦已有 Panel。  
_Avoid_：路由实现细节、把地址当成 Registry 真源

**Inspector（面板侧栏）** _[C]_：Session **Panel** 右侧可收起的窄栏，讲这条会话「在跟谁、花了多少」：Bot / template / preset、Dialogue 与工作区、本会话的 **Deliverable**、上下文与 token 用量（含 dsh 的 Compact），以及通往 **Bot Settings** 的入口。属于 Panel，不属于 Session（同一 Session 的两个 Panel 各自开关）；不拥有域数据。  
_Avoid_：DSH 官方 Web GUI 的 Inspector、把 Inspector 当第二个 Navigator、把用量/交付物另存一份产品数据

**Bot identity mark（Bot 标记）** _[C]_：Bot 的视觉身份——一个 accent 颜色加一个几何 glyph，出现在 Navigator、对话、Panel 标签、Inspector 与创建 / 设置流程。属于注册表数据，不是 dsh preset 正文。  
_Avoid_：角色画 / 头像上传、把标记塞进 Agent preset、把颜色当能力

**Bot Settings（助手设置）** _[C]_：Client 壳里的一个 sheet，编辑某个 **Bot** 的 Profile / Runs with / Skills / Plugins；改成注册表偏好（名称、说明、模型、思考档、默认工作区），能力仍是那个 **Agent Preset**。  
_Avoid_：第二个 Bot 编辑器页、把 preset 正文写进注册表、把全局插件开关伪装成每 Bot 差异

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

**SessionController**：按 Session 的运行时 module：从官方 `ctx.sessions` 的一个 Session binding 读运行态与事件窗口（follow / 分页 / 重连 / prompt·queue·cancel 状态都归官方 client model），自己只持有产品新增的部分——**TurnProjection**、草稿与附件、审批展示、每 Panel 的视图；对外提供 prompt / queue / withdraw / cancel / loadOlder。由 registry 按 sessionId 惰性创建，无 Panel 且未运行、无待审批、草稿已清空时释放（释放延迟一个 tick，避免 Panel 重渲染时拆掉官方本地 generation），运行中的留在后台把回复跑完。  
_Avoid_：全局单例 runtime、ChatPane 自持帧解析、把 controller 当产品对象、把草稿或附件放回 Panel（切 Panel 会丢）、在 controller 里自建 follow / 重连 / 回执映射

**ClaimedSession**：认领 Session 的客户端 module：一条共享 Connection（含它装上的一代官方 client model）、create + claim、dispose；产品路径不创建未认领 Session。Session 运行态与审批路由属 **SessionController** 与官方 `ctx.sessions`。（实现名；认领目标应对齐 Dialogue——见映射图。）  
_Avoid_：`myaid-primary`、未认领的固定 Session、把连接复制到每个 controller

**SessionRoster**：产品 Session 名册 module：认领 × dsh listing × 摘要 → 列表行，再把 **SessionController** / 未读状态投影到行；未认领不进列表。  
_Avoid_：在 List/Main 内拼装行模型、把状态点做成第二套会话模型

## Harness 概念（上游，桶 A）

**Session**：Harness 持久执行会话与事件日志。产品 **Session（会话）** 与此同名同物，须认领到 Dialogue。  
**Agent / AgentHandle**：进程内执行实例与销毁权。Bot ≠ Agent。  
**Agent Preset**：声明式 Agent 能力组合（顶层主要为 `id` + `plugins`）；人设、工具、skills、可选 MCP 客户端行等经子插件进入。Bot 的能力真源。Permission preset 是另一概念。  
**Profile**：部署级 Cordis 具名组装（如 `web`）。  
**Remote**：插件向客户端暴露的公开调用面。  
**Goal / Todo / Job / Workspace / Deliverable…**：上游专有含义见 DSH 文档；产品生活域不抢用 Goal/Todo 英文名；产品 Deliverable 对齐上游当轮交付物语义。
