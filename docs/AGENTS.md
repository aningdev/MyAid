# 文档规范

写或改本仓文档前读本文。

## 四类文档

| 文档                                                           | 回答                   | 规则                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GLOSSARY](GLOSSARY.md)                                        | 这些东西**是什么**     | `**Term**: 定义` 加 `_Avoid_`，以及 Relationships；不写实现细节                                                                                             |
| [ARCHITECTURE](ARCHITECTURE.md) 和 `architecture/<subject>.md` | 系统**怎么搭**         | 只写现状和约定，不写历史；专题文档每个主题一篇，并列在 Subjects 表里                                                                                        |
| `decisions/NNNN-<decision>.md`                                 | **为什么**这样定       | 写难以撤销的选择：Context / Decision / Why / Rejected，不超过一屏；写好后不改，要改就写一条新的，并注明它取代哪一条                                         |
| `specs/YYYY-MM-DD-<feature>.md`                                | 一个功能要**达成什么** | Why / Goal / Out of scope / Acceptance criteria（每条带例子，并标 automated 或 manual）/ Open questions；不写设计和任务；目标变了就在原文里补上带日期的修订 |

改了机制，就在同一次改动里更新描述它的那篇文档。计划、评审和报告都不是文档。

## 单元三件套

| 文件           | 读者  | 语言 | 内容                                                     |
| -------------- | ----- | ---- | -------------------------------------------------------- |
| `README.md`    | 人    | 英文 | 这个单元的契约：职责、边界指针、命令，必要时加布局和限制 |
| `README.zh.md` | 人    | 中文 | 和 `README.md` 结构对齐                                  |
| `AGENTS.md`    | Agent | 中文 | 约束和指针；不写教程，不重复 README 的命令表             |

两种 README 的顶部互相链接：`English | [中文](README.zh.md)` / `[English](README.md) | 中文`。

| 位置              | README 对 | AGENTS                             |
| ----------------- | --------- | ---------------------------------- |
| 仓库根            | 必需      | 必需                               |
| 每个 `apps/*`     | 必需      | 必需                               |
| `packages/`       | 简短索引  | 插件族约束（`packages/AGENTS.md`） |
| 每个 `packages/*` | 必需      | 默认不建，确有额外约束才建         |
| 每个 `tests/*`    | 必需      | 默认不建                           |

`docs/` 下的正文只写中文；`references/` 和 `scripts/` 不要求三件套。

## README 必含章节

1. 一句话职责
2. 边界指针（链到 ARCHITECTURE、decision 或子树 AGENTS，不重复内容）
3. 常用命令（以 `package.json` / `Cargo.toml` 为准）
4. 布局要点（只在不明显时写）
5. Known limitations（没有就省略）

## 写作禁令

- 同一事实只写一处，其他地方用相对链接指过去；链接由 `bun run check` 校验。
- 根 README 写产品说明（定位、Owner 能看到的部件、平台、文档入口），仓库地图和包命令放到各单元 README。
- 不写历史叙事，也不加「已实现 / 未实现」之类的状态注脚。
- 不重复 `package.json` scripts 或 `--help` 一眼就能查到的内容，除非容易踩坑。
- 用 [GLOSSARY](GLOSSARY.md) 里的术语，不用它 `_Avoid_` 里列的词。
