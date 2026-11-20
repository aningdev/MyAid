# 0005 全量改名为 dsh-bot，不做兼容迁移

## Context

项目改名为 dsh-bot。旧名分散在 bundle id、npm 作用域、二进制、crate、环境变量和数据根里。

## Decision

| 位置          | 新名                                             |
| ------------- | ------------------------------------------------ |
| 产品与仓库    | dsh-bot，`aningdev/dsh-bot`                      |
| App bundle id | `com.aningdev.dshbot`                            |
| npm 作用域    | `@dsh-bot/*`，工作区根为 `@dsh-bot/workspace`    |
| Host 二进制   | `dsh-bot-host`                                   |
| 环境变量      | `DSH_BOT_*`                                      |
| 数据根变量    | `DSH_BOT_HOME`（不用 dsh 自己的 `DSH_HOME`）     |
| 数据根        | `~/.dsh-bot`，隔离开发用 `~/.dsh-bot-dev/<name>` |

代码里不读旧名，也不写自动迁移。Owner 自己把旧数据根改名一次：`mv <旧数据根> ~/.dsh-bot`。

## Why

只有一个 Owner，手动迁移一次的成本远低于长期维护一个兼容层。

## Rejected

- **自动迁移旧数据根**：代码要一直留着这段只会跑一次的逻辑。
- **保留旧的内部名，只改展示名**：名字两套并存，新人看不懂。
