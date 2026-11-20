# dsh-bot 术语表

dsh-bot 的产品语言。英文术语用于类型、接口和代码命名，中文用于解释。上游 DeepSeek Harness（dsh）的同名概念不在这里改义，见文末「Harness 概念」。

## Language

### 人与设备

**Owner（主人）**：dsh-bot 唯一服务的那个人。所有已配对的 Device 都代表 Owner。
_Avoid_：User account、Team、Member

**Device（设备）**：装了 Client 并与 Runner 配对的一台终端：桌面、手机、平板或浏览器。
_Avoid_：Node、Peer（dsh remote-access 里另有含义）

**Runner（运行机）**：运行 Host 和 dsh web、执行所有工作的那台桌面 Device。每个 Owner 只有一台。
_Avoid_：Server、把 dsh web 叫 Runner

**Pairing（配对）**：Device 第一次加入时，与 Runner 交换长期公钥的一次性过程，由 Runner 桌面上展示的二维码发起。撤销也在 Runner 上做。
_Avoid_：Login、Sign-in

### 助手

**Bot（助手）**：一个专用助手，由一个 Agent preset、一个 Identity mark 和一条 Dialogue 组成。Owner 可以直接和它对话，也可以由 Main Bot 把工作派给它。
_Avoid_：Agent（dsh 的运行实例）、Profile、Persona

**Main Bot（主 Bot）**：Owner 默认对话的 Bot。它接收 Trigger，把工作拆成 Ticket 派给合适的 Bot。每个 Owner 恰好一个，不能归档或删除。
_Avoid_：Main Agent、Orchestrator、Router（这些是实现名）

**Identity mark（Bot 标记）**：Bot 的视觉身份：一个 accent 颜色，加上 dsh-bot 自己的小角色（身体形状和表情），会随回合状态而动。它不是能力，也不写进 preset。
_Avoid_：Avatar、头像上传

**Registry（注册表）**：所有 Bot、它们的 Identity mark 和段归属的权威集合。所有 Device 读写的都是同一份。
_Avoid_：本机配置、联系人列表

### 对话

**Dialogue（长对话）**：Owner 与一个 Bot 的全部来往，由按时间相连的 Segment 组成。每个 Bot 只有一条。
_Avoid_：Chat、Thread、把一条 Session 当成整条对话

**Segment（段）**：Dialogue 里的一段，对应一条 dsh Session，带日期和工作目录。只有最新的段能发消息；换工作目录就开新段。
_Avoid_：Topic、Conversation

### 工作

**Ticket（工单）**：Main Bot 派给某个 Bot 的一件工作。它在自己的 Session 里执行，Owner 可以随时查看和介入。它会结束，也可以被 Owner 的新消息恢复。
_Avoid_：Task、Job（dsh 的后台命令）、Subagent（dsh 的进程内委派）

**Attention（待你决定）**：一个 Ticket 停下来等 Owner 回答的问题或等 Owner 审阅的结果。Attention 不排在 Dialogue 里，所有 Device 上都会提醒。
_Avoid_：Notification（只是送达方式）、Approval（dsh 的工具审批）

**Source（来源）**：一条外部事件流，例如 IM 会话、GitHub 仓库或定时规则。Owner 可以通过 Source 向 dsh-bot 提出请求，不必打开 Client。
_Avoid_：Integration、Connector、Channel

**Source thread（来源会话）**：Source 里一处可以来回说话的地方，例如一个 IM 群聊或话题、一个 PR。Trigger 来自它，Channel 写回它；Main Bot 为每个 Source thread 用一条自己的 Session。
_Avoid_：Conversation、Chat

**Trigger（触发）**：Source 产生的一条不可变事件。只有 Owner identity 发来的 Trigger 才能开启新工作。
_Avoid_：Event、Message

**Channel（回复渠道）**：Source 的写入端，Ticket 通过它把确认和结果回复到请求所在的地方。
_Avoid_：Source（读写两端不同名）

**Owner identity（主人身份）**：Owner 在某个 Source 上的账号。dsh-bot 不跨 Source 关联不同的账号。
_Avoid_：Allowed list、Policy（团队概念）

### 运行

**Host（本机宿主）**：Runner 上唯一的 Background Service，负责 dsh web 的生命周期，并通过 Bridge 让其他 Device 能连进来。
_Avoid_：Server、Gateway、ProductService

**Bridge（桥）**：Host 的一部分，主动连到 Relay，解开 Device 的密文帧，再代为访问本机的 dsh web。
_Avoid_：Relay、Tunnel

**Relay（中继）**：公网上的零知识转发服务，只看得到 Device 公钥和密文帧。默认由项目提供，Owner 也可以自建。
_Avoid_：Bridge、Proxy、Cloud

**Background Service（后台服务）**：在 OS 上登记、没有窗口也能常驻的进程单元。目前只有 Host。
_Avoid_：Runner、Daemon

**Data root（数据根）**：Runner 上 dsh-bot 和 dsh 共用的数据目录（`$DSH_BOT_HOME`，默认 `~/.dsh-bot`）。
_Avoid_：Workspace

### Client 界面

**Navigator（导航）**：Bot 列表：搜索、Pin 区，其余 Bot 按最近活动排序。
_Avoid_：Sidebar tree、Space

**Pane（面板）**：显示一个 Bot 的 Dialogue 和它的 Ticket 的可聚焦面板。一个 Bot 同时只出现在一个 Pane 里。
_Avoid_：Tab、Window

**Workbench（工作台）**：Pane 的分屏布局。手机上同一时间只显示一个 Pane。
_Avoid_：裸用 Workspace

**Pin（置顶）**：把 Bot 固定在 Navigator 顶部，属于 Device 自己的偏好。
_Avoid_：Favorite

## Relationships

- 一个 **Owner** 有一台 **Runner** 和任意多台已 **Pairing** 的 **Device**；Runner 本身也是 Device。
- 一个 **Owner** 有恰好一个 **Main Bot** 和零到多个其他 **Bot**，都记在同一份 **Registry** 里。
- 一个 **Bot** 有一条 **Dialogue**，一条 Dialogue 有一到多个 **Segment**，每个 Segment 是一条 dsh **Session**。
- **Main Bot** 把工作派成 **Ticket**；每个 Ticket 交给一个 **Bot**（可以是 Main Bot 自己），在自己的 Session 里执行，不算进那个 Bot 的 Dialogue。
- 一个 **Ticket** 有零到多个 **Attention**。
- 一个 **Source** 产生 **Trigger**，交给 **Main Bot**；由此开出的 Ticket 通过同一 Source 的 **Channel** 回复。
- 非 Runner 的 **Device** 经 **Relay** 连到 Runner 上的 **Bridge**；Runner 上的 Client 直连本机。

## Harness 概念（上游，不改义）

**Session**：dsh 的持久执行会话和事件日志。Segment 和 Ticket 用的都是它。
**Agent**：dsh 进程内的执行实例。Bot 不是 Agent。
**Agent preset**：声明式的 Agent 能力组合（`id` 加 `plugins`），是 Bot 能力的来源。
**Profile**：dsh 的部署级装配，dsh-bot 只用 `web`。
**Workspace**：dsh 拥有的目录对象（路径、Session 顺序、置顶和归档）。
**Plugin**：Cordis 装配的能力包，dsh-bot 只通过它扩展能力。
**Remote**：插件对 Client 公开的调用面。
**Model provider**：dsh 的模型路由和它的设置命名空间；API Key 只存在 dsh 的凭据存储里。
