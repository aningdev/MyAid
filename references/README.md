# 参考源码

本目录下的 submodule 只用于阅读、调试和兼容性研究，不属于 Bun workspaces，也不是产品构建或发布输入。布局与 dsh-bot 一致。

| 目录 | 上游 | 用途 |
| --- | --- | --- |
| [deepseek-harness](deepseek-harness/) | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | Harness / Cordis / 官方 bundle 行为依据 |
| [nsh](nsh/) | [longbridge/nsh](https://github.com/longbridge/nsh) | 原生 UI 框架参考 |
| [lorca](lorca/) | [egoist/lorca](https://github.com/egoist/lorca) | 常驻后台与多端机制参考 |
| [waku](waku/) | [egoist/waku](https://github.com/egoist/waku) | 原生客户端与常驻后端分层参考 |

```sh
git submodule update --init references/deepseek-harness references/nsh references/waku references/lorca
```
