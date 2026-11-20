# dsh-bots

[English](README.md) | 中文

拥有产品 Registry——所有 Bot、它们的 Identity mark、每个 Bot 以段组成的唯一长对话，以及新 Bot 的模板——同时拥有 Main Bot 和 Bot Agent preset 的可写部分。所有 Device 都通过 `bots` Remote 读写这一份数据。

决定：[0004](../../docs/decisions/0004-the-registry-lives-in-a-dsh-plugin.md)。用词：[GLOSSARY](../../docs/GLOSSARY.md)。插件规则：[packages/AGENTS.md](../AGENTS.md)。

## 数据

| 内容                | 位置                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| Registry            | `<dataDir>/registry.json`；`dataDir` 默认 `$DSH_HOME/bots`（行 `config`） |
| 派生 preset 记录    | storage domain `bots` 的 `presets` 表（与 dsh 自己的 storages 并列）      |
| 复制后的技能 bundle | `<dataDir>/skills/<presetId>/`                                            |

全新的数据根会得到一份只含 Main Bot 的新 Registry，不导入任何旧数据。

Registry 文件是 v6 文档加一个单调递增的 `revision`。每次写入先写临时文件再改名，读的人不会看到写了一半的 Registry。`snapshot` 与每次写入都返回 `{ registry, revision }`；revision 只增不减。

## Remote

Typert 消费面从 `./remote` 导出，由 Client 在 `apps/client/lib/dsh/sdk.ts` 挂载一次。

| Registry 方法                                          | 作用                                                |
| ------------------------------------------------------ | --------------------------------------------------- |
| `snapshot`                                             | 当前 Registry 与 revision                           |
| `watch`                                                | snapshot 流，每次成功写入后推送（见下）             |
| `createTemplate` / `updateTemplate` / `deleteTemplate` | 模板；仍被 Bot 使用的模板不能删                     |
| `importTemplates`                                      | 把 Host 的 Agent preset 导入为模板，跳过派生 preset |
| `createBot` / `updateBot`                              | Bot 字段；已就绪的 Bot 不能换模板                   |
| `initializeBot`                                        | draft → ready，绑定模板的 preset                    |
| `claimSegment` / `renameSegment` / `releaseSegment`    | 段的归属与标题                                      |
| `archive` / `unarchive` / `deleteBot`                  | 生命周期；有过段的 Bot 不能删除                     |
| `assignPreset`                                         | 记录 Bot 的派生 preset id                           |

| Preset 方法     | 作用                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `derivePreset`  | 把 Bot 的 base preset 复制为 `bots-<slug>-<digest>`，每个 Bot 只派生一次 |
| `readPreset`    | 已存的插件覆盖、技能与 broken 原因                                       |
| `updatePreset`  | 替换插件 / 技能选择并重新注册 Agent preset                               |
| `discardPreset` | 注销它并删除复制出的技能 bundle                                          |

### 变更通知

`watch` 是 Typert stream 方法（`@Remote({ mode: 'stream' })`）。另一个候选是转发 Host 事件，但 dsh 的装配在构建期把转发事件白名单固定在 `API_REMOTE_FORWARDED_EVENTS` 里，第三方插件无法扩展；stream 不需要改 dsh。每条 Client 连接一个 watcher，每次写入后收到 snapshot，Client 不轮询。

## Main Bot

每次启动都保证恰好一个 Main Bot 存在、已就绪、排在列表第一位且未归档：

- id `bots-main`，名字 `Main Bot`，Identity mark 为 indigo / round / calm；
- 绑定 Host 的默认 Agent preset（不带 id 的 `agentPresets.resolve()`）及该 preset 的模板；
- 归档或删除它会被 `bots/main-bot` 拒绝，任何 Device 都不能让 Owner 没有 Bot。

手改文件藏不住它：检查在加载时运行，并会修复一个被归档的 Main Bot。默认 preset 只在创建 Main Bot 时读取；之后改 Host 默认不会改写已存在 Main Bot 的绑定。

## 命令

```sh
vp run dsh-bots#build
vp run dsh-bots#test
vp run dsh-bots#check
```

`scripts/dev.mjs` 会构建本包并把它的行加入开发 overlay（`bots.patch.yml`）。

## 已知限制

- Registry 按 revision 后写者覆盖：两个 Device 同时写会在 Host 上串行，后一次整份覆盖前一次，而不是逐字段合并。
- 派生 preset 复制的是 base 组合；之后对 base preset 的修改不会流入已派生的 preset，除非重新派生。
- 复制出的技能 bundle 是快照：之后编辑源技能不会更新 preset，除非再次保存选择。
