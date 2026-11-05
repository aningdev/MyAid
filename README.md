# MyAid

个人助理操作系统空壳：通过对话交付结果，用任务与结果跟踪进度，用记忆与知识认识你，用插件扩展双手。

- **DSH 原则**继承自本机参考仓 `~/Code/dsh-bot`（官方 `dsh` / Cordis / Host 边界）——见 [docs/DSH_PRINCIPLES.md](docs/DSH_PRINCIPLES.md)。
- **客户端布局**为官方 NSH **mixed**（`App.tsx` + 根级 Rust crate）。
- **不含** dsh-bot 对话工作台业务实现或 DeepSeek 产品品牌内容。

## 仓库形状

| 位置                      | 职责                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/client`             | NSH mixed 客户端（`nsh.json` `"rust": "."`）                                                  |
| `apps/host`               | Rust Host：dsh 生命周期与 HostControl（原则级协议桩）                                         |
| `apps/relay`              | 多端密文转发（空壳）                                                                          |
| `packages/myaid-plugin-*` | Cordis / 声明式 bundle 插件占位                                                               |
| `docs/`                   | [DSH 原则](docs/DSH_PRINCIPLES.md) · [架构](docs/ARCHITECTURE.md) · [蓝图](docs/BLUEPRINT.md) |
| `references/`             | 上游 submodule（只读）                                                                        |

## 开发与运行

产品主路径为 **macOS**（NSH 桌面 + `SMAppService`）。**Windows** 已支持 Host 控制通道联调（named pipe `\\.\pipe\myaid-host`）；不承诺 NSH Windows 桌面窗体或成品后台登记。另需 Rust、NSH **0.4.0**、`vp`（vite-plus）。版本钉以仓库文件为准，勿臆造：

| 钉                         | 现状                                       |
| -------------------------- | ------------------------------------------ |
| Bun `1.4.4`                | [`.bun-version`](.bun-version)             |
| TypeScript / `@types/node` | 根 `workspaces.catalog`；包内 `"catalog:"` |

（未钉 `packageManager` / `engines` / `.node-version`；CI 自行指定 Node。）

dsh 本机认证见 [docs/DSH_CLIENT_AUTH.md](docs/DSH_CLIENT_AUTH.md)。

```sh
bun install
bun run check   # 或 vp run check：vp check --fix → plugin check → nsh check → cargo check
bun run dev     # scripts/dev.mjs：探测/拉起 Host，再起 NSH Client（对齐 dsh-bot）
bun run test
bun run build   # plugin + client（`vp run --filter @myaid/client... build`）
```

数据根：`~/.myaid`（`DSH_HOME`）。根与包的 `package.json` scripts 保留；根脚本用 `vp run pkg#task` / `--filter` 调度包脚本（[Run](https://viteplus.dev/guide/run)）。Git hooks：已有 [`.vite-hooks/pre-commit`](.vite-hooks/pre-commit) → `vp staged`（根未挂 `prepare` → `vp config --hooks`）。完整门禁仍是 `bun run check` / CI。详见 [Commit Hooks](https://viteplus.dev/guide/commit-hooks)。

`bun run dev` 会确保 Host 控制端点可用，再启动客户端；打开 Dialogue / 发消息时会自动 `ensureDsh(userStart)` 拉起官方后台。默认端点：Unix `~/.myaid/host/control.sock`，Windows `\\.\pipe\myaid-host`（可用 `MYAID_HOST_SOCKET` 覆盖）。仅起 Client：`bun run dev:client`。仅起 Host：`bun run host:dev`。

```sh
# 冒烟：apps/host/scripts/smoke-control.sh（Unix）或 bun apps/host/scripts/smoke-control.mjs
```

客户端 `dev` / `dev:macos` 已注入 `MYAID_HOST_SOCKET`；Dialogue 主会话经 Host `connectionInfo` 连接官方 Session。

## 有意省略

- 未移植对话 / 审批 / 模型设置页等产品 UI（客户端已有 AppShell / Dialogue 壳与认证库，非完整业务）
- 未移植完整 Host lifecycle / bot-composition 业务插件
- 无产品线框目录；线框任务另开，不混进本仓库主路径

## 参考 submodule

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
```
