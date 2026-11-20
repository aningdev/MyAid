# dsh-bot-presets

English | [中文](README.zh.md)

Host plugin that gives a Bot its own dsh Agent preset: it copies the Bot's base composition, saves the person's plugin/skill edits in dsh's storage domain, and registers the result through the official `agentPresets.register`. dsh stays the source of truth for execution; the plugin owns only the derived-preset data.

Rules: [packages/AGENTS.md](../AGENTS.md). Principles: [0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md), [ARCHITECTURE](../../docs/ARCHITECTURE.md) Mapping: [GLOSSARY](../../docs/GLOSSARY.md).

## Why this exists

dsh exposes `agentPresets.list/read/select` but no Remote that writes a preset body; bodies live in the profile YAML. Without this plugin Bot Settings › Skills / Plugins is read-only. The plugin supplies the missing writer without moving execution into MyAid:

- `derive({ botId, label, basePresetId })` copies the base composition read through `agentPresets.read`.
- `read(presetId)` returns the saved plugin overrides and added skills.
- `update(presetId, { plugins?, skills? })` replaces the selections and re-registers the preset.
- `discard(presetId)` (Host method `remove`) unregisters it and drops its private skill copies.

The Remote is `botPresets` (routes `botPresets/derive`, `read`, `update`, `discard`); its Typert consumer face is exported as `./remote`, which is what the Client mounts.

## Data ownership

| What                   | Where                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Derived preset records | Storage domain `bot_presets` (the profile's JSON backend, `$DSH_HOME/storages`)                |
| Copied skill bundles   | `<dataDir>/skills/<presetId>/`, `dataDir` defaulting to `$DSH_HOME/bot-presets` (row `config`) |
| Base composition body  | Captured once by `derive` from dsh's `agentPresets.read`; later edits keep the snapshot        |
| Sessions / event logs  | dsh                                                                                            |

Ids are namespaced and stable: `bot-presets-<slug>-<digest>`. The prefix is the plugin's own id, so a preset names the writer that produced it. Derived ids cannot collide with profile presets, and the Client filters them out of the template importer because a derived preset is Bot-owned, not a pickable template.

## Host wiring

A profile install uses the package's own overlay:

```sh
dsh plugin --profile web add /absolute/path/to/packages/bot-presets
```

Development and the Rust Host use an absolute `--patch` overlay naming the built entry:

```yaml
- insert:
    - id: bot-presets
      name: /absolute/path/to/packages/bot-presets/lib/index.js
```

`bun run dev` builds this package and passes that overlay through `MYAID_DSH_PATCH`; the Host forwards each `--patch` to `dsh web`. A running Host that was not launched with the overlay keeps Bot Settings read-only.

## Commands

From the repository root:

```sh
vp run dsh-bot-presets#build
vp run dsh-bot-presets#test
vp run dsh-bot-presets#check
```

`lib/` is build output and is not committed: `build` writes it, `dev` builds it before writing the overlay, and an installed bundle ships it as JavaScript because Node does not strip TypeScript under `node_modules`.

## What an edit means

A plugin switch stores one `{ entryId, moduleName, enabled }` override against the base row. An added skill copies a directory bundle (`SKILL.md`) or a flat `<name>.md` into the preset's private root and mounts that root as an extra `dsh-skill-filesystem` provider (`providerName: bot-presets-skills`, `includeDefaultRoots: false`). The base composition's own skill roots stay in place, so removing a skill here removes only a skill added here.

New Sessions of the Bot select the derived preset (`Bot.derivedPresetId` wins in the registry). Existing Sessions keep the composition their Agent already retains; dsh's own rule for changing a blank Session applies if the person explicitly selects another preset.

## Upgrade note

The plugin id, the Remote and the preset namespace were renamed before release; nothing reads the old names. A derived preset written by the previous plugin id is no longer registered, and the Client drops a `derivedPresetId` outside `bot-presets-` when it reads its registry, so the Bot runs its bound or template preset again and derives a new one on the next capability save. The `$DSH_HOME` data that id left behind — its own storage domain and its own directory under the data root — is inert, and deleting it loses nothing.

## Known limitations

- The derived body is a snapshot: later changes to the base preset or template do not flow into it.
- The base composition's skills cannot be excluded one by one; only skills added here are removable.
- `update` changes capabilities, not the preset label; the label is the Bot's name at `derive` time.
- Derived presets are registered at plugin activation; a removed or unreadable base body leaves the saved record marked broken until it is updated or removed.

## Related

- [@myaid/dsh-web-protocol](../dsh-web-protocol/README.md) — Client-side DTOs of the Remote.
- [@deepseek-ai/dsh-agent-preset-registry](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/preset/agent-preset-registry) — official registry and `agentPresets` Remotes.
- [Bot details](../../apps/client/features/bots/BotDetails.tsx) — the Client surface that calls the Remote.
