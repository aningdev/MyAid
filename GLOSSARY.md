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

**Dialogue（对话）** _[C]_：与某个 Bot 的一段长线交往；**绑定一个 workspace path**（创建或首次确认后固定）。其下 **1 : N Session**（多上下文场景）。换项目工作区 → 新 Dialogue。  
_Avoid_：DSH Session、把「会话」当 Dialogue 的中文、一个 Bot 强制只有一条 Dialogue

**Session（会话）** _[A]_：一个**上下文场景**；产品与 DSH 同名，一对一等于一条 Harness Session（事件日志真源）。连续聊默认同一 Session；显式「新上下文」才新建。须经注册表认领到某 Dialogue 才进入产品。  
_Avoid_：Dialogue、广义 Task、未认领的 Harness Session

**认领（Claim）** _[C]_：注册表中「一条 Session 属于哪个 Dialogue」的记录（Dialogue 已属 Bot）。  
_Avoid_：Session 直接认领到 Bot 而跳过 Dialogue、dsh 事件日志

**归档（Archive）** _[C]_：默认归档 **Dialogue**（整段交往结束）；其下 Session 退出活跃入口，dsh 历史与日志保留。不删除 Bot。  
_Avoid_：删除 Session 日志、把归档当成停用 Bot、默认只归档单条 Session（高级/内部策略除外）

**workspace path（工作区路径）**：Dialogue 上的目录字段；不宣称拥有 DSH Workspace 对象。Bot 可保留默认/上次路径等偏好。  
_Avoid_：与 DSH Workspace 实体混名、同一 Dialogue 来回改 cwd 冒充多项目

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

## Client 壳（交互空壳）

**Workspace Shell（工作区壳）** _[C]_：Client 桌面交互壳 = **左侧可收缩 Navigator** + **右侧 Workbench**；不拥有域数据。  
_Avoid_：左侧图标轨 SideNav、旧 AppShell / 单 Module 整页挂载、与 Dialogue 的 workspace path 混名

**Navigator（导航树）** _[C]_：左侧可调宽多级树（`nsh/base` Tree），可收缩只留顶部拖拽条；节点是导航地址投影。顶层分区（空壳序）：Favorites、Mail、Task、Knowledge、Bots、Dialogues、Spaces、Settings。  
_Avoid_：手写树行、DockArea left dock、把树当成第二套域模型、顶层根名叫 Pin

**Favorites（收藏）** _[C]_：Navigator 顶层分区；Nav address 的快捷入口。  
_Avoid_：Pin（留给各树内置顶）、Space

**Space（空间）** _[C]_：已保存的 Workbench 布局快照（DockArea center 切分树 + 各 Panel 的 Nav address）；打开替换 Workbench。  
_Avoid_：裸名 Workspace、Window（易与 OS 窗混淆）、Favorites

**Workbench（工作台）** _[C]_：右侧可调宽栏内的多面板区（`DockArea` center）；独立 Panel 可拖、拆、缩放、放大、关闭。  
_Avoid_：裸名 Workspace（易与 workspace path / DSH Workspace 混淆）、固定宫格、本阶段多窗多台

**Panel（面板）** _[C]_：Workbench 内一块可聚焦的内容宿主；持有一个导航地址（或空插槽）。  
_Avoid_：Module 整页独占、把 Panel 当成域对象

**Nav address（导航地址）** _[C]_：Navigator 节点与 Panel 内容的稳定身份（域根 + 路径 + 对象引用）；激活叶子默认替换活动 Panel 的地址，同地址则聚焦已有 Panel。  
_Avoid_：路由实现细节、把地址当成 Registry 真源

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

**TurnProjection**：Client 内将 Harness Session follow 帧与本地 prompt 生命周期投影为 Dialogue UI 消息 / live 气泡 / freeze 策略的 module。  
_Avoid_：ChatPane 内二次解析帧、独立 SessionProjector 对外接口

**ClaimedSession**：认领 Session 的客户端 module：连接、create+claim+follow、prompt/approval、dispose；产品路径不创建未认领 Session。（实现名；认领目标应对齐 Dialogue——见映射图。）  
_Avoid_：`myaid-primary`、未认领的固定 Session

**SessionRoster**：产品 Session 名册 module：认领 × dsh listing × 摘要 × 占用 → 列表行；未认领不进列表。  
_Avoid_：在 List/Main 内拼装行模型

## Harness 概念（上游，桶 A）

**Session**：Harness 持久执行会话与事件日志。产品 **Session（会话）** 与此同名同物，须认领到 Dialogue。  
**Agent / AgentHandle**：进程内执行实例与销毁权。Bot ≠ Agent。  
**Agent Preset**：声明式 Agent 能力组合（顶层主要为 `id` + `plugins`）；人设、工具、skills、可选 MCP 客户端行等经子插件进入。Bot 的能力真源。Permission preset 是另一概念。  
**Profile**：部署级 Cordis 具名组装（如 `web`）。  
**Remote**：插件向客户端暴露的公开调用面。  
**Goal / Todo / Job / Workspace / Deliverable…**：上游专有含义见 DSH 文档；产品生活域不抢用 Goal/Todo 英文名；产品 Deliverable 对齐上游当轮交付物语义。
