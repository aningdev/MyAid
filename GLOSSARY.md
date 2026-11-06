# MyAid 术语表

定义 MyAid 产品概念，并区分 DeepSeek Harness 的执行概念。英文用于类型与接口，中文用于解释。产品概念不改变上游同名概念的含义。

## 产品与运行时

**Assistant / Bot（助手档案）**：某个 Bot template 的实例。启动身份是全体助手共用的 `web` profile 上的一个 Agent preset：初始化时绑定的模板 preset，或该 Bot 自己的派生 preset。名下有多条会话。  
_Avoid_：唯一持续对话、独立进程、profile 别名、Agent 引擎本身、Task

**Bot template（模板）**：稳定的产品模板 ID，映射到一个 DSH Agent preset id。模板 ID 不是 preset 正文的快照；未初始化的 Bot 跟随模板当前的 preset id。

**Profile（装配单元）**：Harness 命名运行组合；多个助手共用一个 `web` profile。  
_Avoid_：每助手一个后台

**Runner / dsh web（执行后台）**：官方 Harness 后台，会话与执行状态由其管理。  
_Avoid_：自建 Agent 引擎、Host

**Host（本机宿主）**：App 内轻量 Rust 辅助程序；拥有 dsh 生命周期、连接发现与后续 Bridge。  
_Avoid_：ProductService、统一聊天接口、权威会话存储

**Client（交互客户端）**：NSH 桌面（及未来移动）应用；桌面写注册表，移动端只读快照。

**会话（Conversation）**：某个 Bot 的一项对话任务，与一条 Harness Session 一对一，并由注册表认领到该 Bot。映射见 [docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。  
_Avoid_：Task、跨 Bot 的执行容器、未认领的 Harness Session

**认领（Claim）**：注册表中「一条 Harness Session 属于哪个 Bot」的记录。一条 Session 只属于一个 Bot。  
_Avoid_：会话指针、dsh 事件日志

**归档（Archive）**：会话认领的终态。历史仍在，该会话不再接受新输入。  
_Avoid_：删除会话、停用 Bot、取消归档

**Registry（注册表）**：助手配置与会话认领的权威集合，桌面独占写入。会话事件日志在 dsh。

**Plugin（插件）**：Cordis / 声明式 bundle 装配的能力包（`packages/myaid-plugin-*` 或上游插件）。

**Relay**：多端密文帧转发；不持 owner 凭据。

**Data root（数据根）**：产品本地数据目录，约定 `~/.myaid`（`DSH_HOME`）。

**Generation**：Host 为每次新 dsh 子进程分配的世代标识；连接换代后旧回调失效。

**HostControl**：本机控制通道协议与服务；只承载宿主管理，不承载业务 remote。

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
