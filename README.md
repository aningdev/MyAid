# MyAid

个人助理操作系统空壳：架构镜像自本机参考仓库 `~/Code/dsh-bot`，**不含业务逻辑**。

通过对话交付结果，用任务与结果跟踪进度，用记忆与知识认识你，用插件扩展双手。具体产品规则待蓝图落地。

## 仓库形状

| 位置 | 职责 |
| --- | --- |
| `apps/client` | NSH **mixed** 客户端（`App.tsx` + 根级 Rust crate，`nsh.json` `"rust": "."`） |
| `apps/host` | Rust 后台辅助程序：进程生命周期与本机控制通道（空壳） |
| `apps/relay` | 多端密文转发（空壳） |
| `packages/myaid-plugin-*` | Cordis / Harness 能力插件占位 |
| `scripts` | 开发、检查、打包入口 |
| `references` | 上游参考 submodule（只读，不参与构建） |
| `docs` | 架构与产品文档 |

## 开发与运行

需要 macOS、[Bun](https://bun.sh) ≥ 1.4.4、Rust 工具链、[NSH](https://github.com/longbridge/nsh) 0.3.0。Node 版本见 [`.node-version`](.node-version)。

```sh
bun install
bun run check   # 插件 tsc + 客户端 nsh check + cargo check
bun run dev     # 启动空壳客户端（不自动拉起 host/dsh）
```

数据根约定为 `~/.myaid`（与 dsh-bot 的 `~/.dsh-bot` 对位），空壳阶段尚未写入。

```sh
bun run host:dev   # 空壳 Host：打印用法后退出或等待实现
cargo test -p myaid-relay
```

## 有意省略

- 未移植 dsh-bot / DeepSeek Harness 业务代码、Bot 注册表、审批流、模型设置
- 未捆绑官方 `dsh` 产品内容；插件仅保留 Cordis patch 与导出形状
- 未接入真实 Host 控制协议、macOS 打包与 e2e
- `design/wireframes/` 为并行线框工作，不属于本空壳

## 参考 submodule

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
```

说明见 [references/README.md](references/README.md)。
