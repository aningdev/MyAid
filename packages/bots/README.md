# dsh-bots

English | [中文](README.zh.md)

Owns the product Registry — every Bot, its identity mark, its one long conversation as segments, and the templates a new Bot can start from — plus the Main Bot and the writable half of Bot Agent presets. Every Device reads and writes the single copy through the `bots` Remote.

Decision: [0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md). Terms: [GLOSSARY](../../docs/GLOSSARY.md). Plugin rules: [packages/AGENTS.md](../AGENTS.md).

## Data

| What                   | Where                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Registry               | `<dataDir>/registry.json`; `dataDir` defaults to `$DSH_HOME/bots` (row `config`) |
| Derived preset records | storage domain `bots`, table `presets` (beside dsh's own storages)               |
| Copied skill bundles   | `<dataDir>/skills/<presetId>/`                                                   |

A fresh data root gets a new Registry containing only the Main Bot. Nothing is imported.

The Registry file is a v6 document plus a monotonic `revision`. Every write goes through a temp file and a rename, so a reader never sees half a Registry. `snapshot` and every write return `{ registry, revision }`; the revision only grows.

## Remote

The Typert consumer face is exported as `./remote`; the Client mounts it once in `apps/client/lib/dsh/sdk.ts`.

| Registry                                               | Effect                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `snapshot`                                             | Current Registry and revision                                         |
| `watch`                                                | Stream of snapshots, pushed after every successful write (see below)  |
| `createTemplate` / `updateTemplate` / `deleteTemplate` | Templates; a template in use cannot be deleted                        |
| `importTemplates`                                      | Copies the Host's Agent presets into templates, skipping derived ones |
| `createBot` / `updateBot`                              | Bot fields; a ready Bot cannot change its template                    |
| `initializeBot`                                        | Draft → ready, binds the template's preset                            |
| `claimSegment` / `renameSegment` / `releaseSegment`    | Segment ownership and labels                                          |
| `archive` / `unarchive` / `deleteBot`                  | Lifecycle; a Bot that ever had a segment cannot be deleted            |
| `assignPreset`                                         | Records the Bot's derived preset id                                   |

| Presets         | Effect                                                               |
| --------------- | -------------------------------------------------------------------- |
| `derivePreset`  | Copies a Bot's base preset into `bots-<slug>-<digest>`, once per Bot |
| `readPreset`    | Saved plugin overrides, skills and broken reason                     |
| `updatePreset`  | Replaces plugin/skill selections and re-registers the Agent preset   |
| `discardPreset` | Unregisters it and removes its copied skill bundles                  |

### Change notification

`watch` is a Typert stream method (`@Remote({ mode: 'stream' })`). Forwarded Host events would be the other candidate, but dsh's assembly fixes the forwarded-event allowlist at build time in `API_REMOTE_FORWARDED_EVENTS`, and a third-party plugin cannot extend it; a stream needs no dsh change. One watcher per Client connection receives the snapshot after every write, so the Client never polls.

## Main Bot

On every start the plugin ensures one Main Bot exists, is ready, is first in the list and is not archived:

- id `bots-main`, name `Main Bot`, identity indigo / round / calm;
- bound to the Host's default Agent preset (`agentPresets.resolve()` with no id) and to a template of that preset;
- archiving or deleting it is rejected with `bots/main-bot`, so no Device can leave the Owner without a Bot.

A hand-edited file cannot hide it: the check runs on load, and it also repairs an archived Main Bot. The default preset is read when the Main Bot is created; changing the Host default later does not rewrite an existing Main Bot's binding.

## Commands

```sh
vp run dsh-bots#build
vp run dsh-bots#test
vp run dsh-bots#check
```

`scripts/dev.mjs` builds this package and adds its row to the development overlay (`bots.patch.yml`).

## Known limitations

- The Registry is last-writer-wins by revision: two Devices writing at once are serialized on the Host, and the loser's write replaces the winner's rather than merging fields.
- Derived presets copy a base composition; later edits to the base preset do not flow into a derived one until it is derived again.
- A copied skill bundle is a snapshot: editing the source skill afterwards does not update the preset until the selection is saved again.
