# MyAid 术语表

定义 MyAid 产品概念，并区分 DeepSeek Harness 的执行概念。英文用于类型与接口，中文用于解释。产品概念不改变上游同名概念的含义。

## 产品与运行时

**Assistant / Bot（助手档案）**：某个 Bot template 的实例。启动身份是全体助手共用的 `web` profile 上的一个 Agent preset：初始化时绑定的模板 preset，或该 Bot 自己的派生 preset。名下有多条会话。  
_Avoid_：唯一持续对话、独立进程、profile 别名、Agent 引擎本身、Task

**Bot template（模板）**：稳定的产品模板 ID，映射到一个 DSH Agent preset id。模板 ID 不是 preset 正文的快照；未初始化的 Bot 跟随模板当前的 preset id。

**Profile（装配单元）**：Harness 命名运行组合；多个助手共用一个 `web` profile。  
_Avoid_：每助手一个执行后台、每助手一个 Runner

**Runner / dsh web（执行后台）**：官方 Harness 执行面；会话与执行状态由其管理。口语「执行后台」只指 Runner，不指 OS 常驻服务。  
_Avoid_：自建 Agent 引擎、Host、Background Service

**Background Service（后台服务）**：已向 OS 登记、可脱离 UI 常驻的一个进程单元。当前实例是 Host 与 Relay。  
_Avoid_：Runner、用裸「后台」兼指执行面与 OS 服务、把 Host 与 Relay 合成一个服务身份

**Background（产品后台）**：Client 暴露的产品能力：查询并在用户明确启用后编排 Host 与 Relay 两个 Background Service；停止后台只作用于两服务的运行/登记意图。  
_Avoid_：单一系统守护进程、每助手一套产品后台、与 Runner 混称、把停止后台当成删 Registry / 停会话 / 清 Data root

**Host（本机宿主）**：一个 Background Service；拥有 Runner 生命周期、连接发现与 Bridge。  
_Avoid_：ProductService、统一聊天接口、权威会话存储、Relay、仅「App 内附属」作为领域身份

**Client（交互客户端）**：NSH 桌面（及未来移动）应用；桌面写注册表，移动端只读快照。
**会话（Conversation）**：某个 Bot 的一项对话任务，与一条 Harness Session 一对一，并由注册表认领到该 Bot。映射见 [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。  
_Avoid_：Task、跨 Bot 的执行容器、未认领的 Harness Session

**认领（Claim）**：注册表中「一条 Harness Session 属于哪个 Bot」的记录。一条 Session 只属于一个 Bot。  
_Avoid_：会话指针、dsh 事件日志

**归档（Archive）**：会话认领的终态。历史仍在，该会话不再接受新输入。  
_Avoid_：删除会话、停用 Bot、取消归档

**Registry（注册表）**：助手配置与会话认领的权威集合，桌面独占写入。会话事件日志在 dsh。

**Plugin（插件）**：Cordis / 声明式 bundle 装配的能力包（`packages/myaid-plugin-*` 或上游插件）。

**Relay**：一个 Background Service；多端密文帧转发；不持 owner 凭据。  
_Avoid_：Bridge、持有凭据的网关、Host 子进程（默认存活模型）

**Bridge**：Host 内的设备授权与官方协议转发面。  
_Avoid_：Relay、产品后台入口、替代 Runner

**Data root（数据根）**：产品本地数据目录，约定 `~/.myaid`（`DSH_HOME`）。

**Generation**：Host 为每次新 dsh 子进程分配的世代标识；连接换代后旧回调失效。

**HostControl**：Host 的本机控制通道协议与服务；查询/登记事实与 Runner 生命周期管理；不承载业务 remote。  
_Avoid_：RelayControl、业务 Remote

**RelayControl**：Relay 的本机控制通道协议与服务；查询/登记事实与就绪状态；不承载业务 remote，不解密载荷。  
_Avoid_：HostControl、把 Relay 启停塞进 HostControl

**TurnProjection**：Client 内将 Harness Session follow 帧与本地 prompt 生命周期投影为 Dialogue 消息 / live 气泡 / freeze 策略的 module。  
_Avoid_：ChatPane 内二次解析帧、独立 SessionProjector 对外接口

**ClaimedSession**：认领会话客户端 module：连接、create+claim+follow、prompt/approval、dispose；产品路径不创建未认领 Session。  
_Avoid_：`myaid-primary`、未认领的固定 Session

**SessionRoster**：产品会话名册 module：认领 × dsh listing × 摘要 × 占用 → 列表行；未认领不进列表。  
_Avoid_：在 List/Main 内拼装行模型

## Harness 概念（上游）

**Session**：Harness 持久执行会话与事件日志。产品里的会话是被某个 Bot 认领的一条 Session。  
**Agent / AgentHandle**：进程内执行实例与销毁权。  
**Preset**：可注册的 agent 预设定义。  
**Remote**：插件向客户端暴露的公开调用面。
