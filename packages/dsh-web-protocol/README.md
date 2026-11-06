# `@myaid/dsh-web-protocol`

**Client-only** TypeScript re-exports of official `dsh web` Typert Remote / wire contracts.

- **Consumer:** [`apps/client`](../../apps/client) only.
- **Plugins (`myaid-plugin-*`):** do **not** depend on this package. Use official `@deepseek-ai/dsh-*` Host / Cordis forms directly.
- **Source of truth:** published npm `@deepseek-ai/dsh-*`, pinned to the same version as [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) (currently `0.2.2-rc.1`). Never use npm `latest` (often an ancient RC). Never copy types from `references/deepseek-harness`.

This package has **no runtime**. Every entry is `export type *` over official `./types` and generated `./remote` faces.

## Usage

```ts
import type { SessionFollowFrame, ModelCatalog } from "@myaid/dsh-web-protocol/session";
import type { ApprovalOutcome } from "@myaid/dsh-web-protocol/interaction";
import type { RemoteResult } from "@myaid/dsh-web-protocol/connection";
```

Prefer **domain subpaths** (`/session`, `/settings`, …). The root entry re-exports the remotes facade plus **namespace** aliases (`Session`, `Llm`, …) to avoid cross-domain name collisions; subpaths remain the stable import style.

Product DTOs that reshape wire (for example a flattened model list) must use **different names** from official types (e.g. `FlatModelCatalog` vs `ModelCatalog`).

## What is included

Full web Remote surface from `@deepseek-ai/dsh-api-remotes/client` plus companions:

| Subpath | Coverage |
| --- | --- |
| `/remotes` | `dsh-api-remotes` client facade |
| `/session` | session-controller, session, projection, stats, turn-outline, attachment |
| `/llm` | llm remote + message/content types |
| `/presets` | agent-preset-registry, permission-presets |
| `/settings` | settings-controller, settings, credentials |
| `/workspace` | workspace-controller, workspace-files, workspace, directory-picker |
| `/job` `/terminal` `/account` `/commands` `/goals` | matching controllers |
| `/schedule` `/subagent` | remote(+client); no dedicated `./types` |
| `/interaction` | user-questions, user-approval |
| `/feedback` `/uploads` `/references` `/plugins` `/docs` `/cordis` `/analytics` `/access` | remaining remotes |
| `/connection` | gateway, client-connection, typert-protocol |

**Excluded:** official Web GUI / brand packages, Host webserver/frontend runtimes, tool execution plane (`dsh-tool-*`), experimental remotes, stdio `@deepseek-ai/dsh-sdk-protocol`. For `dsh-client-ui-*`, only `./remote` (and `./types` when present) — never UI modules.

## Capability map (Client mount status)

MyAid Connection currently **mounts** only:

- `session` (+ skills / fileReferences on that remote)
- `agentPresets`

Other remotes below are typed here for future UI; **mount before calling**.

| Product UI | Remote namespace(s) | Mounted today? |
| --- | --- | --- |
| Dialogue / prompt / follow / model catalog | `session` | yes |
| Agent preset picker | `agentPresets` | yes |
| Approvals (event) | `approval/request` via connection events | yes (handler) |
| Settings / credentials | `settings`, `credentials` | no |
| Workspace / files / picker | `workspace`, `workspaceFiles`, `directoryPicker` | no |
| Terminal | `terminal` | no |
| Jobs | `job` | no |
| Account | `account` | no |
| Commands / goals / schedule / subagents | `commands`, `goals`, `schedule`, `subagents` | no |
| Plugins / market / inventory | `pluginManager`, `pluginMarket`, `pluginInventory`, … | no |
| Uploads / references / feedback / … | see assembly | no |

## Follow-ups (not blocking this package)

1. Reuse official `dsh-api-session-controller/client` session models if they shrink the hand-written Dialogue projector.
2. Map `SessionFollowFrame` / wire events onto `features/dialogue/session/projector.ts` end-to-end.
3. Type `$on("approval/request")` against `dsh-user-approval` and keep product copy in the UI layer only.
4. Decide how thin `lib/dsh/connection.ts` stays vs calling typed `remote.session.*` from features.
5. Plugin Host contracts: use `@deepseek-ai/dsh-agent`, `dsh-tools`, `dsh-session` per upstream docs — **no** MyAid host-protocol wrapper.

Upstream read-only docs: `references/deepseek-harness/docs/api-gateway.md`, `docs/subsystems/web-client.md`.

## Check

```sh
vp run @myaid/dsh-web-protocol#check
```
