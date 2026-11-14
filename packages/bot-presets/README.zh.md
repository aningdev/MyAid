# dsh-bot-presets

[English](README.md) | 中文

Host 侧插件，给一个 Bot 自己的 dsh Agent preset：复制该 Bot 的基础组合，把人对插件 / 技能的编辑存进 dsh 的 storage domain，再经官方 `agentPresets.register` 注册。执行仍以 dsh 为真源；插件只拥有派生 preset 的数据。

约束：[packages/AGENTS.md](../AGENTS.md)。原则：[DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) §4、[ARCHITECTURE](../../docs/ARCHITECTURE.md) §4。映射：[BOT_SESSION_MAP](../../docs/BOT_SESSION_MAP.md)。

## 为什么存在

dsh 有 `agentPresets.list/read/select`，但没有写 preset 正文的 Remote：正文住在 profile 的 YAML 里。没有本插件，Bot 详情的「技能 / 插件」是只读的。插件补上这个写入口，而执行不搬进 MyAid：

- `derive({ botId, label, basePresetId })`：经 `agentPresets.read` 抄下基础组合。
- `read(presetId)`：返回已存的插件覆盖与已加技能。
- `update(presetId, { plugins?, skills? })`：整体替换选择并重新注册 preset。
- `discard(presetId)`（Host 方法名 `remove`）：注销该 preset 并删掉它的私有技能副本。

Remote 名为 `botPresets`（路由 `botPresets/derive`、`read`、`update`、`discard`）；Typert 消费面从 `./remote` 导出，由 Client 挂载。

## 数据归属

| 内容                | 位置                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| 派生 preset 记录    | storage domain `bot_presets`（profile 的 JSON backend，`$DSH_HOME/storages`）              |
| 复制后的技能 bundle | `<dataDir>/skills/<presetId>/`，`dataDir` 默认 `$DSH_HOME/bot-presets`（行 `config` 可改） |
| 基础组合正文        | `derive` 时从 dsh 的 `agentPresets.read` 抄下的快照；之后的编辑只改快照                    |
| Session / 事件日志  | dsh                                                                                        |

Id 稳定且带命名空间：`bot-presets-<slug>-<digest>`。前缀就是插件自己的 id，所以一个 preset 自己说明了它由谁写出。派生 id 不会与 profile preset 冲突；Client 的模板导入会过滤它们，因为派生 preset 属于某个 Bot，不是可选模板。

## 挂载方式

装进 profile 用本包自带的 overlay：

```sh
dsh plugin --profile web add /absolute/path/to/packages/bot-presets
```

开发期与 Rust Host 用绝对路径的 `--patch` overlay 指向构建产物：

```yaml
- insert:
    - id: bot-presets
      name: /absolute/path/to/packages/bot-presets/lib/index.js
```

`bun run dev` 会先构建本包，再经 `MYAID_DSH_PATCH` 把该 overlay 交给 Host；Host 把每个 `--patch` 转给 `dsh web`。没带 overlay 启动的 Host 仍保持 Bot 详情只读。

## 命令

在仓库根：

```sh
vp run dsh-bot-presets#build
vp run dsh-bot-presets#test
vp run dsh-bot-presets#check
```

`lib/` 是构建产物、不入库：`build` 写出它，`dev` 在写 overlay 前构建它，安装后的 bundle 带的是 JavaScript——Node 不会在 `node_modules` 下剥 TypeScript。

## 一次编辑的含义

插件开关存一条 `{ entryId, moduleName, enabled }` 覆盖，作用于基础组合里的那一行。添加技能会把目录 bundle（含 `SKILL.md`）或扁平 `<name>.md` 复制进该 preset 的私有根，再把该根挂成额外的 `dsh-skill-filesystem` provider（`providerName: bot-presets-skills`、`includeDefaultRoots: false`）。基础组合自己的技能根保留，所以这里移除技能只移除这里添加的。

Bot 的**新** Session 选用派生 preset（注册表里 `Bot.derivedPresetId` 优先）。已存在的 Session 保留它已持有的组合；若人显式另选 preset，按 dsh 对空白 Session 的规则生效。

## 升级说明

插件 id、Remote 与 preset 命名空间在发版前重命名过；没有代码再读旧名。旧插件 id 写出的派生 preset 不再被注册，Client 读注册表时也会丢掉不在 `bot-presets-` 里的 `derivedPresetId`，于是 Bot 回到它绑定的或模板的 preset，下次保存能力时重新派生。旧 id 留在 `$DSH_HOME` 下的数据（它自己的 storage domain 与它的一个目录）已无人读取，删掉不丢东西。

## 已知限制

- 派生正文是快照：之后改基础 preset 或模板不会流入它。
- 基础组合自带的技能不能逐个排除；这里只移除本插件添加的技能。
- `update` 改的是能力，不是 preset 标签；标签是 `derive` 时 Bot 的名字。
- 派生 preset 在插件激活时注册；基础正文被删或读不到时，已存记录会标为 broken，直到更新或移除。

## 相关

- [@myaid/dsh-web-protocol](../dsh-web-protocol/README.zh.md) —— Remote 的 Client 侧 DTO。
- [@deepseek-ai/dsh-agent-preset-registry](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/preset/agent-preset-registry) —— 官方 registry 与 `agentPresets` Remote。
- [Bot 详情](../../apps/client/features/bots/BotDetails.tsx) —— 调用该 Remote 的 Client 界面。
