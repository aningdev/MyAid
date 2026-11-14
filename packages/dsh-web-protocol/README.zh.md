# `@myaid/dsh-web-protocol`

[English](README.md) | 中文

**仅给 Client 用**的 TypeScript 再导出：产品实际导入的官方 `dsh web` Typert Remote / 线协议契约。索引：[packages/README.zh.md](../README.zh.md)。

- **消费者：** 仅 [`apps/client`](../../apps/client/README.zh.md)。
- **插件（`myaid-plugin-*`）：** **不要**依赖本包。按官方 `@deepseek-ai/dsh-*` 的 Host / Cordis 形态直接依赖。
- **版本真源：** 根 [`package.json`](../../package.json) → `workspaces.catalog` 钉住全部 `@deepseek-ai/dsh-*`，以及该发行版规定的共享版本（`@deepseek-ai/cordis`、`zod`）；包内一律写 `"catalog:"`。[`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 为 Host 指明同一版本（Host 把该文件编译进二进制），两者不一致时 `bun run check` 失败。勿用 npm `latest`（常是很旧的 RC）。勿从 `references/deepseek-harness` 抄类型。

**升级 dsh：** 同时改 `workspaces.catalog` 里的 `@deepseek-ai/*` 与 `apps/host/supported-dsh.json`，再 `bun install`、`bun run check`。别处不再写 dsh 版本。

本包**无运行时**。入口是对官方 `./types` 的 `export type`，以及对 `.../remote` 的 `export type {}`（供 declaration merge）。

## 用法

```ts
import type { BotPresetRecord } from "@myaid/dsh-web-protocol/bot-presets";
import type { ISessions } from "@myaid/dsh-web-protocol/client";
import type { ApprovalOutcome } from "@myaid/dsh-web-protocol/interaction";
import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
```

优先用**领域子路径**。根入口把同样的模块再导出为**命名空间**别名（`Client`、`Session`、`Llm` …）以避免跨域同名冲突；稳定导入风格仍是子路径。

改写线协议的产品 DTO 必须与官方类型**不同名**（例如 `FlatModelCatalog` vs `ModelCatalog`）。

## 包含范围

只包含产品今天真正导入的面：

| 子路径         | 覆盖                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/client`      | 官方 React-free Client 模型：session-controller `/client`、workspace-controller `/client`、`dsh-client-store`、session id |
| `/session`     | session-controller、session、projection、stats、turn-outline、attachment                                                  |
| `/llm`         | llm Remote + message / content 类型                                                                                       |
| `/settings`    | settings-controller、settings、credentials                                                                                |
| `/workspace`   | workspace-controller、workspace-files、workspace、directory-picker                                                        |
| `/interaction` | user-questions、user-approval                                                                                             |
| `/plugins`     | plugin-manager、plugin-market、plugin-inventory、plugin-manager 的 Remote 类型                                            |
| `/bot-presets` | `myaid-plugin-bot-presets` 的 `myaidBotPresets` DTO —— 不依赖 dsh                                                         |

**不在这里：** 产品还没调用的 Remote —— account、analytics、commands、gateway / connection、feedback、goals、jobs、terminal、schedule、subagent、uploads、docs、preset registry、access。要加一个域，连同第一个调用方一起加：先在 `references/deepseek-harness` 读上游面，加子路径，把它再导出的包按 `"catalog:"` 写进本包 `package.json`，再在 Client 里 `$mount` 该 Remote。

**排除：** 官方 Web GUI / 品牌包、Host webserver/frontend 运行时、工具执行面（`dsh-tool-*`）、stdio `@deepseek-ai/dsh-sdk-protocol`。对 `dsh-client-ui-*` 只取 `./remote`——永不取 UI 模块。

## 产品模块 → Remote → 阶段

| 产品                            | Remotes / 类型                                                                                                                                                                | 阶段               | 备注                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
| 对话                            | `session`（`create`/`list`/`follow`/`prompt`/`cancel`/`modelCatalog`/`selectModel`/`updateQueue`/`attachment`）；`SessionFollowFrame`；`approval/request` → `ApprovalOutcome` | A（现在）          | 认领 Session → 对话循环                |
| Bot                             | `agentPresets`（`list`/`read`/`select`）；`session.create`                                                                                                                    | A                  | 认领留在桌面注册表                     |
| Bot 设置                        | `skills.list`；`pluginInventory.list`；`agentPresets.read`；`myaidBotPresets`（`derive`/`read`/`update`/`discard`）                                                           | 现在               | `myaidBotPresets` 需要 Bot preset 插件 |
| Inspector                       | `session.projections`（`contextPressure` / `tokenUsage`）；`session.canOpenWorkspacePath` / `openWorkspacePath`；`commands.execute`（`/compact`）                             | 现在               | 成本未暴露 → 不出行                    |
| Bot 工作目录                    | 只用 `directoryPicker`                                                                                                                                                        | B                  | 路径存 Bot；当 `cwd` 传                |
| 设置                            | `settings`、`credentials`                                                                                                                                                     | B                  | UI 偏好留本地 —— 永不进 dsh            |
| 附件                            | `fileUploads`、`session.attachment`、`PromptContentPart`                                                                                                                      | C                  | 文本先行之后                           |
| 插件导航                        | `pluginManager`（后续 market/inventory）                                                                                                                                      | D                  | 先做启停 UI                            |
| Terminal / Jobs / Goals / …     | 对应 remotes，暂无类型子路径                                                                                                                                                  | 按需               | 对话循环不依赖                         |
| Task / Knowledge / Note / Today | —                                                                                                                                                                             | 非 Session Remotes | Today = HostControl；Task 属生活域     |

## Client 永不调用

- **`workspace.*` 会话容器**（`create` / `archiveSession` / `pinSession` / workspace follow…）——产品用 Bot 认领注册表。
- **`account.*`** —— DeepSeek 账号/品牌面；凭据走 `settings` / `credentials`。
- **`@deepseek-ai/dsh-sdk-protocol`** —— stdio SDK，不是 web Remote。
- 官方 Web GUI / 品牌包。

## Client 挂载现状（`lib/dsh/connection.ts`）

`Connection.connect` 常驻挂载：`session`（含 `skills` / `fileReferences`）、`agentPresets`、`botPresets`（`@myaid/myaid-plugin-bot-presets/remote`）、`directoryPicker`（经 workspace-controller）、`settings`（含 `credentials`）、`fileUploads`、`pluginManager`、`pluginInventory`、`commands`。

对话提示词接受 `PromptContentPart`（文本 / 图片 / 文件回执）。图片走内联 image part；非图片文件由 `fileUploads.upload` 暂存；`session.attachment` 读回持久图片。

**调用任何其他命名空间前：** 在 `sdk.ts` + `Connection.connect` 里 `$mount` 它的官方 `/remote`。

## 后续

1. 官方 session 模型若能缩小对话投影，复用 `dsh-api-session-controller/client`。
2. `SessionFollowFrame` → 投影的完整映射覆盖。
3. 产品 UI 需要时再接 `userQuestions`（类型已在，Remote 未挂载）。
4. `lib/dsh/connection.ts` 保持薄壳（鉴权、epoch、unwrap、产品 DTO 映射）。
5. 插件 Host 契约：按上游文档用 `@deepseek-ai/dsh-agent`、`dsh-tools`、`dsh-session` —— **不要** MyAid 自建 host-protocol 包装。

上游只读：`references/deepseek-harness/docs/api-gateway.md`、`docs/subsystems/web-client.md`。

## 检查

```sh
vp run @myaid/dsh-web-protocol#check
```
