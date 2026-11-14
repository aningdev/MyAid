# MyAid

[English](README.md) | 中文

MyAid 是**类 lorca 的桌面 Bot 应用**：管理一组 Bot、在同一窗口里同时和多个 Bot 长线对话，并把它们配到你选的模型上。

- **能力底座：** 官方 DeepSeek Harness（`dsh`）负责执行、工具、插件与审批。
- **多端壳：** Native Shell（NSH）承载桌面与未来移动端 UI。
- **桌面为本、本地操作、多端可连：** App 跑在**一台桌面**上；数据与执行留在**这台本机**；其它设备**连回**这台机（NSH 客户端 + Relay）。本机由 **Host** + 官方 **`dsh web`**（web profile）持有；你启用后台后，关窗不必拆掉这个本机入口。

## 它解决什么

- **一眼看见 Bot** — 左侧是一条扁平列表：搜索、**Pin**、其余按最近活动排序（工作中的点、未读数）、**新建 Bot**。没有域、没有树。
- **同时和多个 Bot 对话** — 中间是可平铺 **Pane** 的分屏区（横 / 纵再拆、拖动分隔线、关闭、拖 Bot 进来、⌘ 切焦点）；一个 Bot 只在一个 Pane 里，再点它只切焦点。
- **每个 Bot 只有一条长对话** — 历史是按时间相连的**段**（dsh Session），段可以落在不同的 dsh Workspace。本轮先把一个 Bot 打开到它最近的那条 Session，连续视图在下一批。
- **Bot 详情不离开 Pane** — Pane 顶部的弹窗里是 Profile、Runs with、Skills、Plugins、默认工作目录、删除 / 归档，以及当前段的路径、模型、用量与 Compact。
- **身份由你掌控** — Bot 管 preset / 能力；注册表管名字、Pin 与归档位；dsh 管 Workspace 与 Session。
- **桌面常驻可连** — Host（以及后续 Relay）可作为 OS Background Service，让关窗后本机仍可被多端链接；须你明确启用。
- **用插件伸手** — 能力经 Cordis / 声明式 bundle 挂在共用 `web` profile 或派生 preset 上。

## 产品视角怎么拼在一起

| 部件                              | 对你意味着                                                               |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Client（NSH）**                 | 多端控制面：Bot 列表、Pane、Bot 详情、设置、审批、后台                   |
| **Host**                          | 本机 Background Service：`dsh web` 生命周期、发现、Bridge                |
| **`dsh web`**（产品口语：Runner） | web profile 上的官方执行面：Session、工具、事件 — _Runner 不是 DSH 专名_ |
| **Plugins**                       | 扩展助手能力的能力包                                                     |
| **Relay**（目标）                 | 密文链路，让其它端连回桌面本机；手机不另起执行面                         |

产品规则：[docs/BLUEPRINT.md](docs/BLUEPRINT.md)。术语：[GLOSSARY.md](GLOSSARY.md)。映射图：[docs/BOT_SESSION_MAP.md](docs/BOT_SESSION_MAP.md)。

## 平台

- **本机：** 一台 macOS 桌面（NSH；可选 `SMAppService` 让本机入口常驻）。
- **另有：** Windows 上 Host 控制通道联调；不承诺完整 Windows 桌面成品与后台登记。
- **可链接端：** NSH 移动端经 Relay 连回——单栏：Bot 列表 → 长对话，Bot 详情为全屏页；Bot 与凭据仍只在桌面本机管理。

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
bun run dev        # 桌面端：重建过期的 Host、装载 Bot preset 插件、起 Client
bun run dev web    # 其他目标：web / mobile / ios / android / macos / windows / linux / gpui
bun run check
bun run test
```

`bun run dev` 先核对再启动：`node_modules` 与 catalog 的 `@deepseek-ai/*` 版本不符、或 `bun.lock` / `package.json` 比安装结果新时自动 `bun install`；`myaid-host` 比自身源码或 `apps/host/supported-dsh.json` 旧时自动重建。dsh 版本只有两个地方写：根 `package.json` 的 `workspaces.catalog` 与 `apps/host/supported-dsh.json`，`bun run check` 会核对二者一致。
