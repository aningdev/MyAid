# MyAid

[English](README.md) | 中文

MyAid 是 **all-in-one 个人助手**：把生活与工作里「人与 AI 一起操作」的内容收进同一产品——邮件、广义 **Task**、知识、笔记等——用 **Bot** 与 **Dialogue（对话）** 串起来。

- **能力底座：** 官方 DeepSeek Harness（`dsh`）负责执行、工具、插件与审批。
- **多端壳：** Native Shell（NSH）承载桌面与未来移动端 UI。
- **桌面为本、本地操作、多端可连：** App 跑在**一台桌面**上；数据与执行留在**这台本机**；其它设备**连回**这台机（NSH 客户端 + Relay）。本机由 **Host** + 官方 **`dsh web`**（web profile）持有；你启用后台后，关窗不必拆掉这个本机入口。

## 它解决什么

- **串起日常域** — 邮件、Task、知识、笔记是一等公民；Dialogue 驱动它们，也可从它们回到对话。
- **和 Bot 对话** — **Bot** 像联系人，能力来自（常派生的）**Agent preset**；**Dialogue** 是与该 Bot 的一段长线（例如每个项目工作区一段）；**Session（会话）** 是 Dialogue 内的一个上下文场景（= 一条 harness Session）。
- **身份由你掌控** — Bot 管 preset/能力；Dialogue 管 workspace path；Session 认领到 Dialogue。
- **桌面常驻可连** — Host（以及后续 Relay）可作为 OS Background Service，让关窗后本机仍可被多端链接；须你明确启用。
- **用插件伸手** — 能力经 Cordis / 声明式 bundle 挂在共用 `web` profile 或派生 preset 上。

## 产品视角怎么拼在一起

| 部件                              | 对你意味着                                                               |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Client（NSH）**                 | 多端控制面：生活域、Bot、Dialogue、审批、后台                            |
| **Host**                          | 本机 Background Service：`dsh web` 生命周期、发现、Bridge                |
| **`dsh web`**（产品口语：Runner） | web profile 上的官方执行面：Session、工具、事件 — _Runner 不是 DSH 专名_ |
| **Plugins**                       | 扩展助手能力的能力包                                                     |
| **Relay**（目标）                 | 密文链路，让其它端连回桌面本机；手机不另起执行面                         |

产品规则：[docs/BLUEPRINT.md](docs/BLUEPRINT.md)。术语：[GLOSSARY.md](GLOSSARY.md)。映射图：[docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。

## 平台

- **本机：** 一台 macOS 桌面（NSH；可选 `SMAppService` 让本机入口常驻）。
- **另有：** Windows 上 Host 控制通道联调；不承诺完整 Windows 桌面成品与后台登记。
- **可链接端：** NSH 移动端经 Relay 连回；Bot 与凭据仍只在桌面本机管理。

## 文档

| 文档                                       | 内容                            |
| ------------------------------------------ | ------------------------------- |
| [BLUEPRINT](docs/BLUEPRINT.md)             | 产品目标与业务规则              |
| [ARCHITECTURE](docs/ARCHITECTURE.md)       | 装配与接缝                      |
| [DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md)   | 官方 `dsh` / Cordis / Host 边界 |
| [DSH_CLIENT_AUTH](docs/DSH_CLIENT_AUTH.md) | 本机认证 / Cookie WebSocket     |
| [GLOSSARY](GLOSSARY.md)                    | 产品与 harness 用词             |

MyAid **不含** DeepSeek 产品品牌内容，也不迁入官方 harness Web GUI；复用官方执行面，在 NSH 上自建控制 UI。

## 开发者

贡献约束：[AGENTS.md](AGENTS.md)。文档分层：[docs/AGENTS.md](docs/AGENTS.md)。各单元契约与命令：[apps/client](apps/client/README.zh.md)、[apps/host](apps/host/README.zh.md)、[apps/relay](apps/relay/README.zh.md)、[packages/](packages/README.zh.md)。

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
bun install
bun run dev      # Host + Client
bun run check
```
