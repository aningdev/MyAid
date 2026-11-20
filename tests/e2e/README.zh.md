# @dsh-bot/e2e

[English](README.md) | 中文

Relay 隧道的端到端测试：真 Relay、真 Host（含 Bridge）和 Client 真正的 relay Carrier，全部跑在 loopback 上，只有 dsh web 是假的。它们证明 spec 的验收 8（Relay 看不到内容）和验收 9（撤销立即生效），见 [relay-tunnel · 验证](../../docs/architecture/relay-tunnel.md#验证)。

## 命令

```sh
bun run test:e2e                    # 在根目录：先构建二进制，再跑所有用例
bun run --cwd tests/e2e test:e2e    # 同上，只跑这个包
bun run --cwd tests/e2e check       # 给用例做类型检查
```

整层必须在 60 秒内跑完（不含开头的 `cargo build`）。它不碰 `~/.dsh-bot`、`~/.dsh-bot-dev` 和项目 Relay，也不安装任何服务。

## 用例拿到什么

每个测试文件调用 [`support/harness.ts`](support/harness.ts) 的 `startStack()`，起下面这些：

| 进程                  | 启动方式                                                                                                           | 说明                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `dsh-bot-relay`       | `serve --bind 127.0.0.1 --port 0 --ready-stdout --frame-tap <文件>`                                                | 用 `frame-tap` feature 构建；tap 文件记录每一个被转发的帧。                    |
| 假 dsh web            | 在测试进程里（[`support/fake-dsh.ts`](support/fake-dsh.ts)）                                                       | 登录换 Cookie、`POST /api/echo`、`/api/slow` 和 `/api/remote.mux`。            |
| `fake-dsh` 可执行文件 | 临时目录里的一个 shell 脚本                                                                                        | 回答 `--version`，然后打印假 dsh web 的登录 URL 并休眠；Host 把它当 dsh 运行。 |
| `dsh-bot-host`        | `serve --data-root <临时目录>/data --dsh <fake-dsh> --port 0 --ready-stdout`，`DSH_BOT_RELAY_URL` 指向上面的 Relay | 经 `POST /dsh/start` 启动 dsh；它的 Bridge 向 Relay 登记。                     |

Device 就是 Client 自己的 relay Carrier，从 `@dsh-bot/client/relay`（[`apps/client/lib/carrier/relay/index.ts`](../../apps/client/lib/carrier/relay/index.ts)）导入，没有复制任何代码。它导入的两个 NSH 模块 `nsh` 和 `websocket`，由 [`vite.config.ts`](vite.config.ts) 里的 `resolve.alias` 换成 [`support/nsh.ts`](support/nsh.ts) 和 [`support/websocket.ts`](support/websocket.ts)。[`support/device.ts`](support/device.ts) 经 `POST /bridge/pairing` 配对：链接从响应直接在内存里交给 `pairDevice`，不写文件，也不进日志。

不论成败，`stop()` 都会结束所有进程并删掉临时目录。

## 用例

| 文件                                                                             | 验收 | 证明                                                                          |
| -------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| [`cases/relay-sees-no-content.test.ts`](cases/relay-sees-no-content.test.ts)     | 8    | tap 里的任何帧都没有标记、Device 公钥和 device id；每一帧都是头加密文。       |
| [`cases/revocation-is-immediate.test.ts`](cases/revocation-is-immediate.test.ts) | 9    | 被撤销 Device 的在线流失败、配对记录清除，旧身份再握手收到 `device-revoked`。 |
| [`cases/frames.test.ts`](cases/frames.test.ts)                                   | —    | tap 读取器能在任何写法里找到标记，并标出不是密文的帧。                        |
