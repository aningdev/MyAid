# MyAid 产品蓝图（原则版）

描述产品目标与业务规则的**原则层**；装配与协议细节见 [ARCHITECTURE.md](ARCHITECTURE.md)，DSH 集成原则见 [DSH_PRINCIPLES.md](DSH_PRINCIPLES.md)。对外产品概述见根 [README.md](../README.md)。用词见根 [GLOSSARY.md](../GLOSSARY.md)。

## 产品定位

MyAid 要做 **all-in-one 个人助手**：把个人生活与工作里「人与 AI 一起操作」的内容收进同一产品，而不是一堆互不相关的聊天窗或单点工具。

- **能力底座**：官方 DeepSeek Harness（`dsh`）——Session 执行、工具、插件、审批与事件真源。
- **多端壳**：Native Shell（NSH）——桌面与未来移动端共用的产品 UI / 原生框架。
- **连接面**：**Bot**（联系人式助手档案；能力 = 派生 **Agent preset**）与 **Dialogue**（与该 Bot 的长线对话）把 Mail、广义 **Task**、Knowledge、Note 等域对象串起来；Dialogue 下的 **Session** 是具体上下文场景。

### 运行与数据拓扑（目标）

- **一个桌面端为本**：App 的执行与权威运行落在一台桌面机上的 Host + 官方 `dsh web`（web profile）；桌面 UI 是主控制面，不是「每台设备各自一套执行面」。
- **数据与操作在本地**：注册表、域数据、工作区与执行都在该机（数据根约定 `~/.myaid`）；不以云端同步目录为产品真源。模型凭据仍走上游 dsh settings，不进客户端文件。
- **多端可链接**：手机等其它端经 Relay 等通道**连回**这台桌面本机；其它端不打包独立 `dsh web`，Bot / 凭据只在桌面管理。
- **关 UI ≠ 关本机**：用户明确启用产品后台后，Host（及目标中的 Relay）可作为 OS Background Service 常驻，使本机在无桌面窗体时仍可被多端链接、继续已接纳工作；遇审批时可能等待用户在任一已连接端答复。

机制细则见下节「本机常驻与升级」；配对与链路可靠性另案设计。产品口语 **Runner** = 本机 `dsh web` / web profile 执行面（非 DSH 专名）。

### 生活与工作域（目标面）

| 域                     | 原则角色                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Mail（邮件）**       | 收件、起草、跟进与 AI 协助处理的入口之一                                                                      |
| **Task（任务，广义）** | 临时 / 周期 / 长期、可勾选、可拆解的伞概念；≠ Session / Dialogue。产品英文不用 Goal / Todo（避免与 DSH 抢词） |
| **Knowledge（知识）**  | 可检索、可引用的长期材料                                                                                      |
| **Note（笔记）**       | 轻量捕获与整理；可沉淀进知识或挂到 Task                                                                       |

原则：

- 域对象是**一等公民**：有自己的列表、详情与生命周期；**不是** Session、Bot 或 Dialogue。
- Bot + Dialogue 是**总线**：执行与审批发生在 Session 上；域对象通过引用、挂载、摘要、工具结果与 Deliverable 与对话互联。
- **Deliverable**：某一 Session 场景内的交付产物（对齐 DSH）；长 Dialogue 可有多个。不另造 Outcome。
- 当前实现可先做 Bot / Dialogue / Session；各域细模型**按阶段补 ADR / 专章**。
- 终局是「人与 AI 操作的内容」尽量进 MyAid；未接入的域不阻塞已上线路径。

## 本机常驻与升级

服务于上一节拓扑：让「桌面为本、本地操作、多端可连」在关窗后仍成立。

- 首次打开只查询本机 Background Service 状态；用户明确「启动后台」才申请登记 / 启动。
- 系统禁用后台后不自动改用其他常驻方式；保留数据与修复入口，恢复批准后仍须明确启动。
- 升级默认等待无活动执行、待处理输入与待审批；「立即升级」须确认。保留 Session / 队列 / 核对记录；不补发输入、不自动答复审批。

## Bot · Dialogue · Session（原则）

决定见 [ADR 0001](adr/0001-bot-has-many-sessions.md)。映射图见 [BOT_SESSION_MAP](BOT_SESSION_MAP.md)。

- **Bot**：联系人式档案；能力真源为共用 `web` profile 上的一个 Agent preset（模板绑定或派生；`plugins` 承载指令、工具、skills、可选 MCP 等）。**1 : N Dialogue**。≠ live Agent。
- **Dialogue**：与该 Bot 的一段长线对话；**绑定一个 workspace path**。Coding bot 多项目 = 同一 Bot 下多个 Dialogue。草稿 Bot 无 Dialogue。
- **Session**：Dialogue 内的一个上下文场景 = 一条 DSH Session。连续聊默认同一 Session；显式「新上下文」才新建。
- **认领**：Session → Dialogue（Dialogue 已属 Bot）。未认领 Session 不进产品列表。
- **归档**：默认归档 **Dialogue**；其下 Session 退出活跃入口；不删除 dsh 日志；不退役 Bot。
- 进入 Bot 先看到其 Dialogue 列表；进入 Dialogue 再看/切换其下 Session。不自动打开某一条。
- 能力与默认模型属于 **Bot**（preset）；工作区路径属于 **Dialogue**。同一 workspace path 同时只有一条 Session 可执行；路径不同可并行。
- 可先保存未就绪 Bot，条件满足后再初始化；失败保留草稿与修复入口。
- 执行结束 ≠ Task 完成。有未决审批时留在该 Session 及其 Dialogue / Bot 上下文中；缺少审批 UI 不能默认放行。
- 域对象不是 Session；禁止把域列表塞进 Session 事件模型冒充产品存储。

## 配置所有权

| 真源                | 内容                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| dsh / 上游 settings | 模型供应商、端点、凭据（密钥不入客户端文件）                                |
| 桌面注册表          | Bot / Dialogue / Claim、模板引用、默认模型偏好、Dialogue 的 workspace path  |
| 界面偏好            | 主题、窗口等非关键状态                                                      |
| 域数据（目标）      | 邮件索引、Task、知识与笔记等；权威落点按域另定，不默认写入 dsh Session 日志 |

桌面独占写注册表；移动端（未来）只读快照。

## 输入与状态

- 发送前保存稳定请求标识与正文；超时 ≠ 未接纳。
- 区分草稿、发送待确认、已接纳、执行中、执行结束；按 **Session** 计算。执行结束 ≠ Task 完成。
- 停止当前执行、撤回未领取输入、停止后台为三项独立操作。
- 首版对话可先交付纯文本；附件、记忆与各生活域的深度集成为后续阶段。

## 能力与扩展

- 执行与工具优先复用官方 `dsh` / 已装插件；产品缺口才建 `myaid-plugin-*`（见 [DSH_PRINCIPLES.md](DSH_PRINCIPLES.md) §4）。
- 初始化把模板当时映射的 Agent preset id 绑定到该 Bot。单独配置能力 → 派生 preset id（覆盖 `plugins`）；模板引用保持不变。
- 该 preset 是这个 Bot 下各 Session 的启动身份。保存后，正在执行的一轮不打断；空闲后同一 Session id 可用新 preset 恢复（受 DSH「首 turn 后锁定」等规则约束时，按上游行为新开 Session）。
- 需授权的工具调用必须可审批；缺少审批 UI 不能默认放行。
- 多端 UI 与原生能力走 NSH；不另起平行前端框架树。

## 多端（目标）

- NSH 覆盖桌面与移动**控制面**；执行与权威数据仍在那一台桌面本机。
- 经 Relay 转发密文帧；其它端链接本机，不另起 `dsh web`。Bot / 凭据只在桌面管理。配对与可靠性另案设计。

## 验收（原则）

- 仅支持经本机验证的官方 `dsh` 版本；不兼容时阻止发送并保留草稿。
- Host 控制协议与客户端原生适配须联调；`SMAppService` 以签名成品为准。
