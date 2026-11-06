# `@myaid/dsh-web-protocol`

**Client-only** TypeScript re-exports of official `dsh web` Typert Remote / wire contracts.

- **Consumer:** [`apps/client`](../../apps/client) only.
- **Plugins (`myaid-plugin-*`):** do **not** depend on this package. Use official `@deepseek-ai/dsh-*` Host / Cordis forms directly.
- **Source of truth:** published npm `@deepseek-ai/dsh-*`, pinned to the same version as [`apps/host/supported-dsh.json`](../../apps/host/supported-dsh.json) (currently `0.2.2-rc.1`). Never use npm `latest` (often an ancient RC). Never copy types from `references/deepseek-harness`.

This package has **no runtime**. Entries are `export type` over official `./types` plus `export type {} from '.../remote'` for declaration merges.

## Usage

```ts
import type { RemoteResult } from "@myaid/dsh-web-protocol/connection";
import type { ApprovalOutcome } from "@myaid/dsh-web-protocol/interaction";
import type { SessionFollowFrame, ModelCatalog } from "@myaid/dsh-web-protocol/session";
```

Prefer **domain subpaths** (`/session`, `/settings`, …). The root entry re-exports the remotes facade plus **namespace** aliases (`Session`, `Llm`, …). Product DTOs that reshape wire must use **different names** (e.g. `FlatModelCatalog` vs official `ModelCatalog`).

## Product module → Remote → phase

| Product                              | Remotes / types                                                                                                                                                              | Phase               | Notes                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------- |
| Dialogue                             | `session` (`create`/`list`/`follow`/`prompt`/`cancel`/`modelCatalog`/`selectModel`/`updateQueue`/`attachment`); `SessionFollowFrame`; `approval/request` → `ApprovalOutcome` | A (now)             | Claimed Session loop             |
| Bots                                 | `agentPresets` (`list`/`read`/`select`); `session.create`                                                                                                                    | A                   | Claims stay in desktop registry  |
| Bot workspace path                   | `directoryPicker` only                                                                                                                                                       | B                   | Store path on Bot; pass as `cwd` |
| Settings                             | `settings`, `credentials`                                                                                                                                                    | B                   | UI prefs stay local — never dsh  |
| Attachments                          | `fileUploads`, `session.attachment`, `PromptContentPart`                                                                                                                     | C                   | After text-first                 |
| Plugins nav                          | `pluginManager` (+ market/inventory later)                                                                                                                                   | D                   | Enablement UI only               |
| Terminal / Jobs / Goals / …          | matching remotes                                                                                                                                                             | on demand           | Not required for dialogue loop   |
| Tasks / Outcomes / Knowledge / Today | —                                                                                                                                                                            | not Session Remotes | Today = HostControl              |

## Never call from MyAid Client

- **`workspace.*` session container** (`create` / `archiveSession` / `pinSession` / workspace follow…) — product uses Bot claim registry instead.
- **`account.*`** — DeepSeek account/brand surface; credentials go through `settings` / `credentials`.
- **`@deepseek-ai/dsh-sdk-protocol`** — stdio SDK, not web Remote.
- Official Web GUI / brand packages.

## Client mount status (`lib/dsh/connection.ts`)

Always mounted in `Connection.connect`: `session` (+ `skills` / `fileReferences`), `agentPresets`, `directoryPicker` (via workspace-controller), `settings` (+ `credentials`), `fileUploads`, `pluginManager`.

Dialogue prompt path accepts `PromptContentPart` (text / image / file receipt). Image send uses inline image parts; `fileUploads.upload` stages non-image files; `session.attachment` reads durable images back.

**Before calling any other namespace:** `$mount` its official `/remote` in `sdk.ts` + `Connection.connect`.

## Follow-ups

1. Reuse `dsh-api-session-controller/client` session models if they shrink the Dialogue projector.
2. Full `SessionFollowFrame` → projector mapping coverage.
3. `userQuestions` / `permissionPresets` when product UI needs them.
4. Keep `lib/dsh/connection.ts` a thin facade (auth, epoch, unwrap, product DTO maps).

Upstream read-only: `references/deepseek-harness/docs/api-gateway.md`, `docs/subsystems/web-client.md`.

## Check

```sh
vp run @myaid/dsh-web-protocol#check
```
