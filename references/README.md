# 参考源码

本目录下的 submodule 只用于阅读、调试和兼容性研究，不属于 Bun workspaces，也不参与产品构建或发布。

| 目录 | 上游 | 用途 |
| --- | --- | --- |
| [deepseek-harness](deepseek-harness/) | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | dsh / Cordis / 官方 bundle 的行为依据；检出的 `dsh-v<version>` tag 必须和 catalog 一致 |
| [dsh-superagent-prototype](dsh-superagent-prototype/) | [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) | 目标参考：Source → Trigger → Ticket → 执行 Session 的领域模型和 dsh bundle 形态（[0002](../docs/decisions/0002-main-bot-delegates-through-tickets.md)） |
| [nsh](nsh/) | [longbridge/nsh](https://github.com/longbridge/nsh) | 原生 UI 框架参考 |
| [lorca](lorca/) | [egoist/lorca](https://github.com/egoist/lorca) | 常驻后台、配对、零知识 Relay 和多端机制参考 |
| [waku](waku/) | [egoist/waku](https://github.com/egoist/waku) | 原生客户端和常驻后端的分层参考 |

```sh
git submodule update --init references/
```
