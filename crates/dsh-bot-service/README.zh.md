# dsh-bot-service

[English](README.md) | 中文

Host 与 Relay 共用的启动计划与登记词汇，照 lorca 的 `crates/cli/src/service.rs`。`Unit` 命名一个单元（launchd label、systemd 单元、参数、日志）；`launchd_plist`、`systemd_unit`、`windows_run_command` 生成安装时会写下的逐字文本，测试只快照、不碰 launchd / systemd / 注册表。`registration.rs` 是 Client 合并的线上形状（`unit`、`phase`、快照、可用度）。

使用方：[`apps/host`](../../apps/host/README.zh.md)、[`apps/relay`](../../apps/relay/README.zh.md)。为什么共用一层：[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)。

## 命令

```sh
cargo check -p dsh-bot-service
cargo test -p dsh-bot-service
```

## 布局

- `src/service.rs` — `Unit`、plist / 单元 / Run 命令行构造、`install`/`uninstall`/`status`、Windows `service run` 监督器
- `src/registration.rs` — 相位、快照、可用度
