# @dsh-bot/e2e

[English](README.md) | 中文

loopback 上的端到端测试，有两套 stack。Relay 隧道那套用真 Relay、真 Host（含 Bridge）和 Client 真正的 relay Carrier，只有 dsh web 是假的；它证明 spec 的验收 8（Relay 看不到内容）和验收 9（撤销立即生效），见 [relay-tunnel · 验证](../../docs/architecture/relay-tunnel.md#验证)。多 Device 那套把真 dsh web 放在 Host 后面，装上本仓的插件和一个按剧本回答的模型供应商，用两台 Device 经 Client 真正的 Connection 去驱动它；它证明验收 3（Main Bot 删不掉）、4（Registry 全端一致）、5（Ticket 生命周期）和 6（Attention 全端可达）。

## 命令

```sh
bun run test:e2e                    # 在根目录：先构建二进制，再跑所有用例
vp run @dsh-bot/e2e#test:e2e        # 同上，只跑这个包
vp run @dsh-bot/e2e#check           # 给用例做类型检查
```

预算和何时跑见 [testing](../../docs/architecture/testing.md)。它不碰 `~/.dsh-bot`、`~/.dsh-bot-dev` 和项目 Relay，也不安装任何服务。

## 用例拿到什么

### 假 dsh 的 stack

每个测试文件调用 [`support/harness.ts`](support/harness.ts) 的 `startStack()`，起下面这些：

| 进程                  | 启动方式                                                                                                           | 说明                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `dsh-bot-relay`       | `serve --bind 127.0.0.1 --port 0 --ready-stdout --frame-tap <文件>`                                                | 用 `frame-tap` feature 构建；tap 文件记录每一个被转发的帧。                    |
| 假 dsh web            | 在测试进程里（[`support/fake-dsh.ts`](support/fake-dsh.ts)）                                                       | 登录换 Cookie、`POST /api/echo`、`/api/slow` 和 `/api/remote.mux`。            |
| `fake-dsh` 可执行文件 | 临时目录里的一个 shell 脚本                                                                                        | 回答 `--version`，然后打印假 dsh web 的登录 URL 并休眠；Host 把它当 dsh 运行。 |
| `dsh-bot-host`        | `serve --data-root <临时目录>/data --dsh <fake-dsh> --port 0 --ready-stdout`，`DSH_BOT_RELAY_URL` 指向上面的 Relay | 经 `POST /dsh/start` 启动 dsh；它的 Bridge 向 Relay 登记。                     |

Device 就是 Client 自己的 relay Carrier，从 `@dsh-bot/client/relay`（[`apps/client/lib/carrier/relay/index.ts`](../../apps/client/lib/carrier/relay/index.ts)）导入，没有复制任何代码。它导入的两个 NSH 模块 `nsh` 和 `websocket`，由 [`vite.config.ts`](vite.config.ts) 里的 `resolve.alias` 换成 [`support/nsh.ts`](support/nsh.ts) 和 [`support/websocket.ts`](support/websocket.ts)。[`support/device.ts`](support/device.ts) 经 `POST /bridge/pairing` 配对：链接从响应直接在内存里交给 `pairDevice`，不写文件，也不进日志。每台 Device 用 Client 真正的 `storageDeviceStore`，底下是各自一份的内存 Storage 替身（Device 之间不共享），所以它的密钥和配对记录就是 `dsh-bot.device.identity` 与 `dsh-bot.device.pairing` 两条记录，和 app 一致，不写磁盘。`nsh` 替身里没有 Storage，用例要是自己去碰 NSH Storage 就会失败。

不论成败，`stop()` 都会结束所有进程并删掉临时目录。

### 真 dsh 的 stack

[`support/real-stack.ts`](support/real-stack.ts) 的 `startRealStack(script)` 复用同一套 Relay 和 Host（[`startPlumbing`](support/harness.ts)），把 Host 后面的东西全换掉：

| 部分                          | 启动方式                                                                                  | 说明                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 钉住版本的 `@deepseek-ai/dsh` | Host 的 `--dsh <它的 lib/bin.js> --patch <临时目录>/plugins.patch.yml`                    | patch 把 `packages/*/lib` 里的 `dsh-bots`、`dsh-tickets` 插进去，和 `scripts/dev.mjs` 的 `prepareOverlay` 一样。`test:e2e` 会先构建这两个包。 |
| 模型供应商                    | 在测试进程里（[`support/llm.ts`](support/llm.ts)）                                        | 线上协议用 `@deepseek-ai/dsh-llm-mock-server`，前面有个路由器按请求挑答案（见下）。key 固定是 `mock-key`。                                    |
| dsh 的环境                    | `HOME` = `<临时目录>/home`，其中 `.zshenv` 导出 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_API_KEY` | Host 用登录 shell 组装 dsh 的环境，这是唯一能到达 dsh 的通道；Owner 自己的登录文件和 key 不会被读。                                           |

**剧本。** mock server 不管收到什么都按固定序列回答，而且只能发一种配置好的工具调用；用例却需要模型按「谁在问、前面发生了什么」来回答。所以 `startLlm(script)` 为每种不同的步骤起一个 mock 实例，前面放一个路由器：它把每个请求读成 `Turn`（提供的工具、最后一条用户文本、最后一个工具结果），调用 `script(turn)` 得到一段文本或一次工具调用，再转给对应的实例，并给每次工具调用单独的 id。Ticket 的 Session 靠 `ticket_report` 与 Main Bot 区分，只有它才有这个工具。`llm.turn(match)` 在匹配的请求到达时 resolve，用例就是这样不靠 sleep 地等「结果回到了 Main Bot 的 Session」。

**Device。** [`connectedDevice`](support/device.ts) 配对一台 Device，并让 Client 的 `Connection`（从 `@dsh-bot/client/dsh` 导入）经它的 Carrier 连上去，所以 Remote 调用和 `watch` 流都是产品自己的 gateway。[`support/watch.ts`](support/watch.ts) 记下 `watch` 的每个快照，快照到达且匹配时 `until(match)` 就 resolve；没有任何地方按时间等。

**每个文件一套 stack。** 测试文件并行跑，而 Registry 和 Tickets 文件会被用例改写，所以每个文件起自己的 stack（约一秒）；文件内的测试共用它，互不依赖。这个 npm 包是本包的 devDependency（`"catalog:"`，和其他 dsh 版本同一个 pin），所以真 dsh 的文件在任何装了依赖的地方都会跑，dsh 起不来就失败，不会跳过。

## 用例

| 文件                                                                             | 验收 | 证明                                                                                                                                           |
| -------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`cases/relay-sees-no-content.test.ts`](cases/relay-sees-no-content.test.ts)     | 8    | tap 里的任何帧都没有标记、Device 公钥和 device id；每一帧都是头加密文。                                                                        |
| [`cases/revocation-is-immediate.test.ts`](cases/revocation-is-immediate.test.ts) | 9    | 被撤销 Device 的在线流失败、配对记录清除，旧身份再握手收到 `device-revoked`。                                                                  |
| [`cases/registry-is-consistent.test.ts`](cases/registry-is-consistent.test.ts)   | 4、3 | 一台 Device 新建并改名的 Bot 出现在另一台的 `watch` 里；经 Relay 删除 Main Bot 被拒绝。                                                        |
| [`cases/ticket-attention.test.ts`](cases/ticket-attention.test.ts)               | 5、6 | Main Bot 在另一个 Bot 下开出 Ticket；它的提问是两台 Device 上的 Attention；一台回答后另一台上消失；Ticket 完成，结果回到 Main Bot 的 Session。 |
| [`cases/device-storage.test.ts`](cases/device-storage.test.ts)                   | —    | Client 的 Storage 存储跑在内存 Storage 上：密钥只生成一次并能读回，配对记录能存、读、清，损坏的记录会报错且不被替换。                          |
| [`cases/frames.test.ts`](cases/frames.test.ts)                                   | —    | tap 读取器能在任何写法里找到标记，并标出不是密文的帧。                                                                                         |
