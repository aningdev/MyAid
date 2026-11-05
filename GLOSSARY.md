# MyAid 术语表

定义 MyAid 产品概念，并区分 DeepSeek Harness 的执行概念。改编自 `~/Code/dsh-bot/GLOSSARY.md`；英文用于类型与接口，中文用于解释。产品概念不改变上游同名概念的含义。

## 产品与运行时

**Assistant / Bot（助手档案）**：某个 Bot template 的实例。具有稳定身份、名称、模板引用、工作区与会话指针；桌面持有，对应唯一持续对话。初始化时绑定模板当时的 Agent preset id；单独配置能力后改用该 Bot 自己的派生 preset id。  
_Avoid_：独立进程、profile 别名、Agent 引擎本身

**Bot template（模板）**：稳定的产品模板 ID，映射到一个 DSH Agent preset id。模板 ID 不是 preset 正文的快照；未初始化的 Bot 跟随模板当前的 preset id。

**Profile（装配单元）**：Harness 命名运行组合；多个助手共用一个 `web` profile。  
_Avoid_：每助手一个后台

**Runner / dsh web（执行后台）**：官方 Harness 后台，会话与执行状态由其管理。  
_Avoid_：自建 Agent 引擎、Host

**Host（本机宿主）**：App 内轻量 Rust 辅助程序；拥有 dsh 生命周期、连接发现与后续 Bridge。  
_Avoid_：ProductService、统一聊天接口、权威会话存储

**Client（交互客户端）**：NSH 桌面（及未来移动）应用；桌面写注册表，移动端只读快照。

**Registry（注册表）**：助手配置与对话指针的权威集合，桌面独占写入。

**Plugin（插件）**：Cordis / 声明式 bundle 装配的能力包（`packages/myaid-plugin-*` 或上游插件）。

**Relay**：多端密文帧转发；不持 owner 凭据。

**Data root（数据根）**：产品本地数据目录，约定 `~/.myaid`（`DSH_HOME`）。

**Generation**：Host 为每次新 dsh 子进程分配的世代标识；连接换代后旧回调失效。

**HostControl**：本机控制通道协议与服务；只承载宿主管理，不承载业务 remote。

## Harness 概念（上游）

**Session**：Harness 持久执行会话与事件日志。  
**Agent / AgentHandle**：进程内执行实例与销毁权。  
**Preset**：可注册的 agent 预设定义。  
**Remote**：插件向客户端暴露的公开调用面。
