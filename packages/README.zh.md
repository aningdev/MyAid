# packages

[English](README.md) | 中文

MyAid 插件与 Client 侧协议类型的 workspace 包。插件规则（取自 dsh）见 [AGENTS.md](AGENTS.md)。文档规范：[docs/AGENTS.md](../docs/AGENTS.md)。

| 包                                                                         | 职责                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@myaid/dsh-web-protocol`](dsh-web-protocol/README.zh.md)                 | 仅给 Client 用的官方 `dsh web` Remote / 线协议类型（产品实导入的部分） |
| [`@myaid/myaid-plugin-core`](myaid-plugin-core/README.zh.md)               | Cordis / 声明式 bundle 能力插件空壳                                    |
| [`dsh-bot-presets`](bot-presets/README.zh.md)                              | Bot 的派生 Agent preset：插件 / 技能编辑与 `botPresets` Remote         |
