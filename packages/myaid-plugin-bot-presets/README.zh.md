# @myaid/myaid-plugin-bot-presets

[English](README.md) | 中文

Host 插件：让每个 MyAid Bot 拥有自己的 Agent preset。它复制 Bot 的基础组合，把用户对插件 / 技能的修改存进 dsh 的 storage domain，再经官方 `agentPresets.register` 注册；执行真源仍在 dsh，插件只拥有派生 preset 的数据。

约束见 [packages/AGENTS.md](../AGENTS.md)；原则见 [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) §4、[ARCHITECTURE](../../docs/ARCHITECTURE.md) §4；对象映射见 [BOT_SESSION_MAP](../../docs/BOT_SESSION_MAP.md)。

## 为什么需要它

dsh 只暴露 `agentPresets.list/read/select`，没有写 preset 正文的 Remote；正文在 profile 的 YAML 里。没有这个插件，Bot Settings › Skills / Plugins 只能只读。插件补上写入口，但不把执行搬进 MyAid：

- `derive({ botId, label, basePresetId })` 经 `agentPresets.read` 复制基础组合。
- `read(presetId)` 读已保存的插件覆盖与已添加技能。
- `update(presetId, { plugins?, skills? })` 替换选择并重新注册。
- `discard(presetId)`（Host 方法 `remove`）注销并删除私有技能副本。

Remote 命名为 `myaidBotPresets`；Typert 消费面从 `./remote` 导出。

## 数据归属

| 内容                | 位置                                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| 派生 preset 记录    | storage domain `myaid_bot_presets`（profile 的 JSON backend，`$DSH_HOME/storages`） |
| 复制后的技能 bundle | `$DSH_HOME/myaid-plugin-bot-presets/skills/<presetId>/`                             |
| 基础组合正文        | `derive` 时从 dsh `agentPresets.read` 抓取的快照；后续编辑不改快照                  |
| Session / 事件日志  | dsh                                                                                 |

Id 稳定且带命名空间：`myaid-bot-<slug>-<digest>`。不会与 profile preset 冲突；Client 的模板导入会过滤它们，因为派生 preset 属于某个 Bot，不是可选模板。

## Host 装配

安装进 profile 时用包自带的 overlay：

```sh
dsh plugin --profile web add /absolute/path/to/packages/myaid-plugin-bot-presets
```

开发态与 Rust Host 用绝对 `--patch` overlay 指向构建产物入口：

```yaml
- insert:
    - id: myaid-bot-presets
      name: /absolute/path/to/packages/myaid-plugin-bot-presets/lib/index.js
```

`bun run dev` 会先构建本包，再经 `MYAID_DSH_PATCH` 把 overlay 交给 Host；Host 把每个 `--patch` 转给 `dsh web`。没有带 overlay 启动的 Host 仍保持 Bot Settings 只读。

## 命令

仓库根：

```sh
vp run @myaid/myaid-plugin-bot-presets#build
vp run @myaid/myaid-plugin-bot-presets#test
vp run @myaid/myaid-plugin-bot-presets#check
```

## 一次修改意味着什么

插件开关存一条 `{ entryId, moduleName, enabled }` 覆盖，作用于基础组合里的那一行。添加技能会把目录 bundle（含 `SKILL.md`）或扁平 `<name>.md` 复制进该 preset 的私有根，再把该根挂成额外的 `dsh-skill-filesystem` provider（`providerName: myaid-bot-skills`、`includeDefaultRoots: false`）。基础组合自己的技能根保留，所以这里移除技能只移除这里添加的。

该 Bot 的新 Session 会选择派生 preset（注册表里 `Bot.derivedPresetId` 优先）。已有 Session 保留其 Agent 已持有的组合；用户显式选择其它 preset 时，按 dsh 对空白 Session 的规则处理。

## 已知限制

- 派生正文是快照：基础 preset 或模板后续的变化不会流入。
- 基础组合自带的技能不能逐个排除；只有这里添加的技能可移除。
- `update` 只改能力，不改 preset 标签；标签是 `derive` 时的 Bot 名。
- 派生 preset 在插件激活时注册；基础正文被删或读不了时，已保存记录会标记 broken，直到更新或移除。

## 相关

- [@myaid/dsh-web-protocol](../dsh-web-protocol/README.md) — Remote 的 Client 侧 DTO。
- [@deepseek-ai/dsh-agent-preset-registry](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/preset/agent-preset-registry) — 官方注册表与 `agentPresets` Remote。
- [Bot Settings](../../apps/client/features/bots/BotSettings.tsx) — 调用该 Remote 的 Client 面。
