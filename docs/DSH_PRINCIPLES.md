# MyAid 继承的 DSH 原则

本文定义 MyAid 的 **DeepSeek Harness / 官方 `dsh` 集成原则**。不迁入官方 harness Web GUI，不含 DeepSeek 产品品牌文案。

权威展开见 [ARCHITECTURE.md](ARCHITECTURE.md)、[BLUEPRINT.md](BLUEPRINT.md)、[GLOSSARY.md](../GLOSSARY.md)；本仓工程约定与读档指针见根 [AGENTS.md](../AGENTS.md)。

## 1. 单一官方执行后台

- 全部助手共用**未经修改**的官方 `dsh web` 与上游 `web` profile。
- 产品数据根隔离为 `~/.myaid`（`DSH_HOME=~/.myaid`），不污染用户的 `~/.dsh`。
- **不**按助手拆 dsh 进程、profile 或插件集；**不**自拼第二套 Agent 执行引擎。
- 运行使用用户安装的官方 `dsh`；版本由 Host 启动时检查（见 `apps/host/supported-dsh.json`）。

## 2. 职责三分：Client / Host / dsh

| 角色              | 职责                                                          | 不负责                                      |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------- |
| **Client**（NSH） | UI、注册表、本地草稿/工作区、产品策略；官方协议客户端直连 dsh | dsh 启停、ready 发现、进程回收              |
| **Host**（Rust）  | App 后台身份、唯一 dsh 生命周期、连接发现、后续 Bridge        | 业务 remote、统一聊天网关、`ProductService` |
| **dsh / Harness** | Session、执行、工具、模型凭据、共享 settings                  | Bot 注册表权威写入                          |

不设 Rust `ProductService`：本地配置与产品交互由 NSH 完成；已有 dsh remote 由官方客户端调用。

## 3. Host 模块边界

| Module         | 公开入口               | 原则                                                                |
| -------------- | ---------------------- | ------------------------------------------------------------------- |
| `dsh_process`  | `Lifecycle`            | 独占 spawn / ready / 监控 / 失败预算 / 回收；内部锁与 guardian 私有 |
| `host_control` | 控制 socket + 共享协议 | 只调用 `Lifecycle`；不复制生命周期策略                              |
| `bridge`       | 多端阶段               | 官方协议转发 + 设备授权；Relay 只转发密文                           |

生命周期相位：`stopped → preparing → starting → ready`（另有 `recovering`；失败 → `failed`；停止 → `stopping → stopped`；与 `protocol.rs` 一致）。每次新子进程新 `generation`。公开 `status` **不得**携带认证 token；`connectionInfo` 与公开状态分离。

## 4. Cordis / 插件

- Bot 能力**优先复用**官方 `dsh web` / 已安装的 dsh 插件；实现前对照只读 [`references/deepseek-harness`](../references/deepseek-harness) 的能力面、preset 与 Remote 形态（机制结论见 [HARNESS_PRINCIPLES](research/HARNESS_PRINCIPLES.md)）。
- 产品缺口放 `packages/myaid-plugin-*`，经 `cordis.patch.yml` / 声明式 bundle / `--patch` 装配进 `web` profile；约束见 [packages/AGENTS.md](../packages/AGENTS.md)。
- 能力规则、专属数据与执行注入归插件；NSH 只经公开 Remote / 接口做管理与产品交互。
- 共享 profile 的全局插件开关不伪装成「每 Bot 差异」；派生组合真源在插件侧。
- 对照 harness **只取能力与协议形态**；不迁入其 Web GUI / 审批页 / 品牌文案（见 §7）。

## 5. 客户端与原生适配

- `apps/client` 采用 NSH **mixed** 布局：`App.tsx` + 根 crate（`nsh.json` `"rust": "."`）。
- TSX 负责产品流程；`src/` 仅补足 NSH 标准 API 的已核实缺口。**NSH 0.4 仍需** `CookieWebSocket`（`src/cookie_websocket/` + `lib/dsh/`）连 `/api/remote.mux`；见 [DSH_CLIENT_AUTH.md](DSH_CLIENT_AUTH.md)。
- HTTP / 普通 WS 用 NSH 标准 API；标准握手能带 Cookie 后再收缩原生适配。

## 6. 异步、协议与持久化

- 跨进程输入在接收端校验；共享 Host 协议集中定义（`apps/host/src/host_control/protocol.rs`）。
- 连接换代 / 切换对象后，旧回调不得回写当前状态；结果未知先核对，不盲目重发。
- 注册表等关键写入串行；区分不存在、损坏与 I/O 失败。

## 7. 有意不迁入

- 官方 harness Web GUI / 审批页 / 模型设置页等产品 UI（NSH 侧自建）
- DeepSeek 产品品牌文案
