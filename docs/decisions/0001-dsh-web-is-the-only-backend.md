# 0001 dsh web 是唯一后端，能力只经插件扩展

## Context

dsh-bot 要做覆盖全端的 Personal Agent，同时不改动 DeepSeek Harness（dsh）的能力，并跟着 dsh 升级。如果自己做执行引擎，或者 fork dsh，每次 dsh 升级都要手工合并。

## Decision

- Runner 上只跑一份官方 `dsh web`（`web` profile），所有 Session、工具、模型路由、设置和凭据都归它管。
- dsh-bot 只通过 dsh 插件（`packages/*`，Cordis bundle 加 Remote）增加能力。Client 只调用官方 Remote 和本仓插件的 Remote。
- dsh 的版本只写在三个地方，并由 `bun run check` 保证三者一致：根 `package.json` 的 `workspaces.catalog`、`apps/host/supported-dsh.json`、`references/deepseek-harness` 子模块的 `dsh-v<version>` tag。插件的 `engines.dsh` 范围必须包含这个版本。
- 不采用 dsh 自带的 Web GUI、审批页和 DeepSeek 品牌文案。dsh 的 `client/ui-*` 插件只能渲染在 dsh 自己的浏览器 Client 里，NSH Client 按插件的 settings schema 和事件做通用渲染。

## Why

升级 dsh 只需要改版本号再跑一遍检查，产品代码和上游之间只隔着公开的插件接口和 Remote。

## Rejected

- **Fork dsh 或给它打补丁**：每次升级都要合并，违背「跟随 dsh 升级」的目标。
- **在 Rust Host 里重新实现执行逻辑**：等于重写 dsh。
- **直接嵌入 dsh 的 Web GUI**：品牌和交互都不属于 dsh-bot，也覆盖不了移动端。
