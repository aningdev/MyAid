# 测试

dsh-bot 的测试怎样分层，每层跑什么、预算多少，测试怎样写才不慢也不脆，以及验收时跑什么。

## 分层

| 层       | 命令                                                                                      | 跑什么                                                                                     | 预算                      | 何时跑                 |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- | ---------------------- |
| 静态     | `bun run check`                                                                           | dsh 版本、文档、lint、类型、`nsh check` / `nsh build`、ui:diff、clippy                     | ≤ 60 s                    | 每次交付；CI           |
| 门禁     | `bun run test`                                                                            | Cargo 测试、各插件包测试、Client headless `nsh test`                                       | ≤ 60 s（不含 Cargo 编译） | 每次交付；CI           |
| 端到端   | `bun run test:e2e`                                                                        | 真 Relay、真 Host 和 Client 的 relay Carrier，只走 loopback，dsh web 是假的（`tests/e2e`） | ≤ 60 s（不含 Cargo 编译） | 每次交付；CI           |
| 原生     | `nsh test --target macos <file>…`（在 `apps/client`）                                     | 截图、原生输入、焦点等 headless 证明不了的                                                 | 只跑改动涉及的文件        | 改到组件层或原生交互时 |
| 人工冒烟 | `bun run dev --isolated`；Client 冒烟设 `DSH_BOT_SMOKE_HOST` 和回环的 `DSH_BOT_RELAY_URL` | 真 dsh、真模型                                                                             | 不进门禁                  | 发布前                 |

默认的测试不需要凭据、外网或正在运行的 Host；需要它们的只在人工冒烟里。测试和开发都不连项目 Relay：`bun run dev --isolated` 没设 `DSH_BOT_RELAY_URL` 时自己起一个只绑 127.0.0.1 的 Relay，Client 的真 Host 冒烟只有在 `DSH_BOT_RELAY_URL` 是回环地址时才准碰 Host（`apps/client/lib/data-root.ts` 的 `hostControlAllowed`）。

## 测试怎样写

- **等条件，不等时间。** 不写固定 sleep，不靠真实的节奏、防抖、轮询间隔或退避走完；时长和时钟从注入点传进来，测试里传零或假时钟，产品默认值不变。
- **不稳就找根因。** 不加重试循环，不加长超时，不放宽断言。
- **一个测试一般不超过 1 秒**，一个 Client 测试文件不超过 8 秒。确实要等更久的（比如原生动画），在测试里写明原因。
- **测试文件之间不共享可变的外部状态**：端口、数据根、固定的文件路径。打开 app 的测试经 `apps/client/test/open.ts` 用各自的 Storage；Rust 测试用临时目录和随机端口。

## Client headless 的并行

`nsh test` 一个文件接一个地跑，而且没有并行参数，所以 `apps/client` 的 `test` 脚本走 `scripts/nsh-test-parallel.mjs`：

- 每个测试文件一个 `nsh test <file>` 进程，`NSH_TEST_JOBS` 个同时跑（默认 CPU 核数减 1，最多 8）。
- 按上次记下的耗时从长到短开跑，耗时缓存在 `apps/client/node_modules/.cache/nsh-test-durations.json`。
- 真 Host 冒烟（`*.smoke.test.tsx`）共用一个数据根：设了 `DSH_BOT_SMOKE_HOST` 时，它们排在池子之后一个一个跑。
- 带任何参数（文件、`--filter`、`--target`、`--junit`）时，就是原样的 `nsh test <参数>`。

墙钟由最慢的那个文件决定，所以单个文件的预算比测试总数更要紧：文件超了 8 秒，就拆开它或去掉里面的等待。

## check 的网络

ui:diff 第一次运行时，把 `nsh-ui.json` 钉在 tag 上的 shadcn-nsh registry（索引和全部 item）镜像到 `apps/client/node_modules/.cache/shadcn-nsh-registry/`，之后对着镜像离线比较。换 tag 就换了缓存 key，会重新镜像。

## 验收时跑什么

- **开发中**：只跑相关的文件，比如 `nsh test <file>`、`cargo test -p <crate> <name>`。
- **交付前**：`bun run check`、`bun run test` 和 `bun run test:e2e` 各跑一次。改到组件层或原生交互时，再用 macOS target 跑涉及的文件，不跑 macOS 全量。
- **CI**（macOS runner）：`bun run check`、`bun run test`、`bun run test:e2e`，按这个顺序。
