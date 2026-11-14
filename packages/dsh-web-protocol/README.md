# `@myaid/dsh-web-protocol`

English | [中文](README.zh.md)

**Client-only** TypeScript re-exports of the official `dsh web` Typert Remote / wire contracts the product imports. Index: [packages/README.md](../README.md).

- **Consumer:** [`apps/client`](../../apps/client) only.
- **Plugins (`myaid-plugin-*`):** do **not** depend on this package. Use official `@deepseek-ai/dsh-*` Host / Cordis forms directly.
- **Version source:** the root [`package.json`](../../package.json) → `workspaces.catalog` pins every `@deepseek-ai/dsh-*` plus the shared pins the release dictates (`@deepseek-ai/cordis`, `zod`); packages reference it with `"catalog:"`. [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) names the same version for the Host (it compiles that file in), and `bun run check` fails when the two disagree. Never use npm `latest` (often an ancient RC). Never copy types from `references/deepseek-harness`.

**Upgrading dsh:** change the `@deepseek-ai/*` entries in `workspaces.catalog` and `apps/host/supported-dsh.json` together, then `bun install` and `bun run check`. No other file names a dsh version.

This package has **no runtime**. Entries are `export type` over official `./types` plus `export type {} from '.../remote'` for declaration merges.

## Usage

```ts
import type { BotPresetRecord } from "@myaid/dsh-web-protocol/bot-presets";
import type { ISessions } from "@myaid/dsh-web-protocol/client";
import type { ApprovalOutcome } from "@myaid/dsh-web-protocol/interaction";
import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
```

Prefer **domain subpaths**. The root entry re-exports the same modules as **namespace** aliases (`Client`, `Session`, `Llm`, …) to avoid cross-domain name collisions; subpaths stay the stable import style.

Product DTOs that reshape wire (for example a flattened model list) must use **different names** from official types (e.g. `FlatModelCatalog` vs `ModelCatalog`).

## What is included

Only the surfaces the product imports today:

| Subpath        | Coverage                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/client`      | React-free official Client models: session-controller `/client`, workspace-controller `/client`, `dsh-client-store`, session ids |
| `/session`     | session-controller, session, projection, stats, turn-outline, attachment                                                         |
| `/llm`         | llm Remote + message / content types                                                                                             |
| `/settings`    | settings-controller, settings, credentials                                                                                       |
| `/workspace`   | workspace-controller, workspace-files, workspace, directory-picker                                                               |
| `/interaction` | user-questions, user-approval                                                                                                    |
| `/plugins`     | plugin-manager, plugin-market, plugin-inventory, plugin-manager Remote types                                                     |
| `/bot-presets` | `myaid-plugin-bot-presets`' `myaidBotPresets` DTOs — no dsh import                                                               |

**Not here:** Remotes the product does not call yet — account, analytics, commands, gateway / connection, feedback, goals, jobs, terminal, schedule, subagent, uploads, docs, preset registry, access. Add one together with its first caller: read the upstream surface in `references/deepseek-harness`, add a subpath, add the packages it re-exports to this `package.json` as `"catalog:"`, and mount the Remote in the Client.

**Excluded:** official Web GUI / brand packages, Host webserver/frontend runtimes, tool execution plane (`dsh-tool-*`), stdio `@deepseek-ai/dsh-sdk-protocol`. For `dsh-client-ui-*`, only `./remote` — never UI modules.

## Product module → Remote → phase

| Product                         | Remotes / types                                                                                                                                                              | Phase               | Notes                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| Dialogue                        | `session` (`create`/`list`/`follow`/`prompt`/`cancel`/`modelCatalog`/`selectModel`/`updateQueue`/`attachment`); `SessionFollowFrame`; `approval/request` → `ApprovalOutcome` | A (now)             | Claim Session → Dialogue loop                 |
| Bots                            | `agentPresets` (`list`/`read`/`select`); `session.create`                                                                                                                    | A                   | Claims stay in desktop registry               |
| Bot settings                    | `skills.list`; `pluginInventory.list`; `agentPresets.read`; `myaidBotPresets` (`derive`/`read`/`update`/`discard`)                                                           | now                 | `myaidBotPresets` needs the Bot preset plugin |
| Inspector                       | `session.projections` (`contextPressure` / `tokenUsage`); `session.canOpenWorkspacePath` / `openWorkspacePath`; `commands.execute` (`/compact`)                              | now                 | Cost is not exposed → no row                  |
| Bot workspace path              | `directoryPicker` only                                                                                                                                                       | B                   | Store path on Bot; pass as `cwd`              |
| Settings                        | `settings`, `credentials`                                                                                                                                                    | B                   | UI prefs stay local — never dsh               |
| Attachments                     | `fileUploads`, `session.attachment`, `PromptContentPart`                                                                                                                     | C                   | After text-first                              |
| Plugins nav                     | `pluginManager` (+ market/inventory later)                                                                                                                                   | D                   | Enablement UI only                            |
| Terminal / Jobs / Goals / …     | matching remotes, no type subpath yet                                                                                                                                        | on demand           | Not required for dialogue loop                |
| Task / Knowledge / Note / Today | —                                                                                                                                                                            | not Session Remotes | Today = HostControl; Task is life-domain      |

## Never call from MyAid Client

- **`workspace.*` session container** (`create` / `archiveSession` / `pinSession` / workspace follow…) — product uses Bot claim registry instead.
- **`account.*`** — DeepSeek account/brand surface; credentials go through `settings` / `credentials`.
- **`@deepseek-ai/dsh-sdk-protocol`** — stdio SDK, not web Remote.
- Official Web GUI / brand packages.

## Client mount status (`lib/dsh/connection.ts`)

Always mounted in `Connection.connect`: `session` (+ `skills` / `fileReferences`), `agentPresets`, `botPresets` (`@myaid/myaid-plugin-bot-presets/remote`), `directoryPicker` (via workspace-controller), `settings` (+ `credentials`), `fileUploads`, `pluginManager`, `pluginInventory`, `commands`.

Dialogue prompt path accepts `PromptContentPart` (text / image / file receipt). Image send uses inline image parts; `fileUploads.upload` stages non-image files; `session.attachment` reads durable images back.

**Before calling any other namespace:** `$mount` its official `/remote` in `sdk.ts` + `Connection.connect`.

## Follow-ups

1. Reuse `dsh-api-session-controller/client` session models if they shrink the Dialogue projector.
2. Full `SessionFollowFrame` → projector mapping coverage.
3. `userQuestions` when product UI needs it (types are here; the Remote is not mounted).
4. Keep `lib/dsh/connection.ts` a thin facade (auth, epoch, unwrap, product DTO maps).
5. Plugin Host contracts: use `@deepseek-ai/dsh-agent`, `dsh-tools`, `dsh-session` per upstream docs — **no** MyAid host-protocol wrapper.

Upstream read-only: `references/deepseek-harness/docs/api-gateway.md`, `docs/subsystems/web-client.md`.

## Check

```sh
vp run @myaid/dsh-web-protocol#check
```
