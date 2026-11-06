# `@myaid/dsh-web-protocol`

[English](README.md) | 中文

**仅给 Client 用**的 TypeScript 再导出：官方 `dsh web` Typert Remote / 线协议契约。索引：[packages/README.zh.md](../README.zh.md)。

- **消费者：** 仅 [`apps/client`](../../apps/client/README.zh.md)。
- **插件（`myaid-plugin-*`）：** **不要**依赖本包。按官方 `@deepseek-ai/dsh-*` 的 Host / Cordis 形态直接依赖。
- **真源：** 已发布 npm `@deepseek-ai/dsh-*`，版本钉与 [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) 一致（当前 `0.2.2-rc.1`）。勿用 npm `latest`（常是很旧的 RC）。勿从 `references/deepseek-harness` 抄类型。

本包**无运行时**。入口是对官方 `./types` 的 `export type`，以及对 `.../remote` 的 `export type {}`（供 declaration merge）。

## 用法

```ts
import type { RemoteResult } from "@myaid/dsh-web-protocol/connection";
import type { ApprovalOutcome } from "@myaid/dsh-web-protocol/interaction";
import type { SessionFollowFrame, ModelCatalog } from "@myaid/dsh-web-protocol/session";
```

优先用**领域子路径**（`/session`、`/settings` …）。根入口再导出 remotes facade 与**命名空间**别名（`Session`、`Llm` …）以避免跨域同名冲突；稳定导入风格仍是子路径。

改写线协议的产品 DTO 必须与官方类型**不同名**（例如 `FlatModelCatalog` vs `ModelCatalog`）。

## 包含范围

完整 web Remote 面来自 `@deepseek-ai/dsh-api-remotes/client` 及其配套：

| 子路径                                                                                   | 覆盖                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `/remotes`                                                                               | `dsh-api-remotes` client facade                                          |
| `/session`                                                                               | session-controller、session、projection、stats、turn-outline、attachment |
| `/llm`                                                                                   | llm remote + message/content 类型                                        |
| `/presets`                                                                               | agent-preset-registry、permission-presets                                |
| `/settings`                                                                              | settings-controller、settings、credentials                               |
| `/workspace`                                                                             | workspace-controller、workspace-files、workspace、directory-picker       |
| `/job` `/terminal` `/account` `/commands` `/goals`                                       | 对应 controllers                                                         |
| `/schedule` `/subagent`                                                                  | remote(+client)；无独立 `./types`                                        |
| `/interaction`                                                                           | user-questions、user-approval                                            |
| `/feedback` `/uploads` `/references` `/plugins` `/docs` `/cordis` `/analytics` `/access` | 其余 remotes                                                             |
| `/connection`                                                                            | gateway、client-connection、typert-protocol                              |

**排除：** 官方 Web GUI / 品牌包、Host webserver/frontend 运行时、工具执行面（`dsh-tool-*`）、experimental remotes、stdio `@deepseek-ai/dsh-sdk-protocol`。对 `dsh-client-ui-*` 只取 `./remote`（及存在时的 `./types`）——永不取 UI 模块。

## 产品模块 → Remote → 阶段

| 产品                            | Remotes / 类型                                                                                                                                                                | 阶段               | 说明                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------- |
| Dialogue                        | `session`（`create`/`list`/`follow`/`prompt`/`cancel`/`modelCatalog`/`selectModel`/`updateQueue`/`attachment`）；`SessionFollowFrame`；`approval/request` → `ApprovalOutcome` | A（当前）          | Session 认领到 Dialogue 的循环     |
| Bots                            | `agentPresets`（`list`/`read`/`select`）；`session.create`                                                                                                                    | A                  | 认领留在桌面注册表                 |
| Bot workspace path              | 仅 `directoryPicker`                                                                                                                                                          | B                  | 路径存在 Bot 上；作为 `cwd` 传入   |
| Settings                        | `settings`、`credentials`                                                                                                                                                     | B                  | UI 偏好本地 — 永不进 dsh           |
| Attachments                     | `fileUploads`、`session.attachment`、`PromptContentPart`                                                                                                                      | C                  | 文本优先之后                       |
| Plugins nav                     | `pluginManager`（后续 market/inventory）                                                                                                                                      | D                  | 仅启用态 UI                        |
| Terminal / Jobs / Goals / …     | 对应 remotes                                                                                                                                                                  | 按需               | 非对话循环必需                     |
| Task / Knowledge / Note / Today | —                                                                                                                                                                             | 非 Session Remotes | Today = HostControl；Task 为生活域 |

## MyAid Client 永不调用

- **`workspace.*` session 容器**（`create` / `archiveSession` / `pinSession` / workspace follow…）——产品用 Bot 认领注册表。
- **`account.*`** —— DeepSeek 账号/品牌面；凭据走 `settings` / `credentials`。
- **`@deepseek-ai/dsh-sdk-protocol`** —— stdio SDK，不是 web Remote。
- 官方 Web GUI / 品牌包。

## Client 挂载状态（`lib/dsh/connection.ts`）

`Connection.connect` 中始终挂载：`session`（+ `skills` / `fileReferences`）、`agentPresets`、`directoryPicker`（经 workspace-controller）、`settings`（+ `credentials`）、`fileUploads`、`pluginManager`。

Dialogue prompt 路径接受 `PromptContentPart`（text / image / file receipt）。图片用内联 image parts；非图片经 `fileUploads.upload` 暂存；持久图片经 `session.attachment` 读回。

**调用任何其它命名空间前：** 在 `sdk.ts` + `Connection.connect` 里 `$mount` 其官方 `/remote`。

## Follow-ups

1. 若能缩小 Dialogue projector，复用 `dsh-api-session-controller/client` session models。
2. 补全 `SessionFollowFrame` → projector 映射覆盖。
3. 产品 UI 需要时再接 `userQuestions` / `permissionPresets`。
4. 保持 `lib/dsh/connection.ts` 为薄 facade（auth、epoch、unwrap、产品 DTO map）。
5. 插件 Host 契约：按上游文档直依 `@deepseek-ai/dsh-agent`、`dsh-tools`、`dsh-session` —— **不要**做 MyAid host-protocol 包装。

上游只读：`references/deepseek-harness/docs/api-gateway.md`、`docs/subsystems/web-client.md`。

## Check

```sh
vp run @myaid/dsh-web-protocol#check
```
