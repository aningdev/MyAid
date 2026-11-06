# 文档规范

写或改本仓文档前读本文。形状对齐 DeepSeek-harness 的分层原则；**不**引入 `*.i18n.yaml`、字数预算门禁或 doc-sync CI。

## 三件套

| 文件           | 受众  | 语言           | 放什么                                                       |
| -------------- | ----- | -------------- | ------------------------------------------------------------ |
| `README.md`    | 人    | 英（对外默认） | 该单元契约：职责、边界指针、命令、必要时布局、限制、相关链接 |
| `README.zh.md` | 人    | 中             | 与 `README.md` 结构对齐的中文对                              |
| `AGENTS.md`    | Agent | 中（单语）     | 站立指令与指针；不写教程、不复述 README 命令表               |

根与各 README 对顶部互链：`English \| [中文](README.zh.md)` / `[English](README.md) \| 中文`。

## 分层（一事实一归宿）

| 归宿                                                  | 只放                               |
| ----------------------------------------------------- | ---------------------------------- |
| 根 `AGENTS.md`                                        | 全局站立指令 + 指针                |
| 子树 `AGENTS.md`（`apps/*`、`packages/`、本文等）     | 该子树专属护栏                     |
| 包 / app / crate `README(.zh)`                        | 该单元契约                         |
| `docs/BLUEPRINT`、`ARCHITECTURE`、`DSH_PRINCIPLES` 等 | 产品与架构真源；包 README 只链过去 |
| `GLOSSARY.md`、`docs/adr/`                            | 用词与决策                         |
| `docs/agents/*`                                       | issue / triage / domain 等流程     |

## 必有文件清单

| 位置                           | README 对       | AGENTS                             |
| ------------------------------ | --------------- | ---------------------------------- |
| 仓库根                         | 必需            | 必需                               |
| `docs/`                        | —               | 本文（文档规范）                   |
| `packages/`                    | 短索引（en/zh） | 插件族护栏（`packages/AGENTS.md`） |
| 每个 `apps/*`                  | 必需            | 必需（现状保留）                   |
| 每个 `packages/*` workspace 包 | 必需            | 默认不建；有额外护栏再建           |
| 每个 `crates/*` Cargo 成员     | 必需            | 仅有独立护栏时建                   |

`references/`、`scripts/` 不强制三件套。`docs/` 产品正文本轮不要求双语对。

## README 必含章节

1. 一句话职责
2. 边界指针（链到 ARCHITECTURE / DSH_PRINCIPLES / 子树 AGENTS，不复述）
3. 常用命令（以 `package.json` / `Cargo.toml` / 根 scripts 为准）
4. 布局要点（仅非显而易见时）
5. Known limitations（无则省略）
6. 相关链接

不强制 YAML frontmatter、TOC、Model Experience。

## 放置与写作禁令

- 不双写：同一契约只在一个归宿；别处用相对链接。
- 根 `README(.zh)` 写**产品说明**（定位、对用户可见部件、平台、文档入口）；仓库地图与包命令下沉到各单元 README。根文末可留极短 Developers 入口（链到 `AGENTS.md` 与各包 README + 最少命令），不写工具链钉版细节。
- 不写历史叙事或「已实现 / 未来」状态注脚；现状以目录与清单为准。
- 不复述可从 `package.json` scripts / `--help` 一眼查到的清单，除非约定或易踩坑。
- AGENTS 不教人上手；上手进 README。
- `myaid-plugin-*` 共用 `packages/AGENTS.md`，叶子默认不建 AGENTS。
- 改行为先改真源文档或代码，再改指向它的 README / AGENTS。
