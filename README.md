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

需要 macOS、Rust、NSH **0.4.0**、`vp`（vite-plus）。工具链版本钉在根目录：

| 钉                                        | 文件 / 字段                                                          |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Bun `1.4.4`                               | [`.bun-version`](.bun-version)、`packageManager` / `engines.bun`     |
| Node `26.13.0`（兼容 `^24.15 \|\| >=26`） | [`.node-version`](.node-version)、[`.nvmrc`](.nvmrc)、`engines.node` |
| TypeScript / `@types/node` / `@types/bun` | 根 `workspaces.catalog` 单源；包内 `"catalog:"` 引用                 |

dsh 本机认证见 [docs/DSH_CLIENT_AUTH.md](docs/DSH_CLIENT_AUTH.md)。

```sh
bun install
bun run check   # 或 vp run check：vp check --fix → plugin check → nsh check → cargo check
bun run dev     # apps/client: nsh run App.tsx（不自动拉起 host/dsh）
bun run test
bun run build   # plugin + client（`vp run --filter @myaid/client... build`）
```

数据根：`~/.myaid`（`DSH_HOME`）。根与包的 `package.json` scripts 保留；根脚本用 `vp run pkg#task` / `--filter` 调度包脚本（[Run](https://viteplus.dev/guide/run)）。Git hooks：`prepare` → `vp config --hooks`，[`.vite-hooks/pre-commit`](.vite-hooks/pre-commit) → `vp staged`。完整门禁仍是 `bun run check` / CI。详见 [Commit Hooks](https://viteplus.dev/guide/commit-hooks)。

```sh
bun run host:dev
```

## 有意省略

- 未移植对话 / 审批 / 模型设置页等产品 UI
- 未移植完整 Host lifecycle / bot-composition 业务插件
- `design/wireframes/` 为并行线框，不属于本空壳

## 参考 submodule

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
```
