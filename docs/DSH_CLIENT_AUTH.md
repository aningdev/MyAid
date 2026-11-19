# MyAid ↔ dsh 本机认证

dsh 只绑回环（Host 以 `dsh web --host 127.0.0.1 --port 0` 启动，端口由 dsh 选）。认证两步，之后同一条 Cookie 既走 HTTP 也走 WebSocket：

1. `GET http://127.0.0.1:<port>/connect?token=…&interactions=answer` → `302` + `Set-Cookie`（`redirect: "manual"`，token 不落盘）。
2. 官方 dsh 客户端的所有调用带该 Cookie：Remote 一元调用是 `POST /api/<endpoint>`，事件流是 `ws://127.0.0.1:<port>/api/remote.mux`。

## Cookie 只走我们自己那条

平台的 cookie jar 绝不能让 dsh 看见。NSH 的 `fetch` 默认带系统 jar，而 dsh 每次 `/connect` 都新发一枚 `dsh-auth-<random>`；jar 会把这些全量回放——一次实测的 `/connect` 带了 **57 枚旧 cookie（16 KB）**，dsh 直接回 `431 Request Header Fields Too Large`。在本机原生栈上 `credentials: "omit"` **不足以**关掉它，**显式 `Cookie` 头**才可以（空串也有效）。

因此 `lib/dsh/auth.ts` 的 `dshRequestInit()` 是所有 dsh HTTP 调用的唯一入口：它设 `credentials: "omit"`，并始终设置 `Cookie`（`/connect` 时是空串，之后是 dsh 发的那枚）。`lib/dsh/auth.test.ts` 钉住这两点；WS 握手本来就带显式 `Cookie`，同样压住 jar。

## 传输

| 层   | 路径                                                                          | 做什么                                                          |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 原生 | —                                                                             | 无：标准 NSH 模块即可                                           |
| WS   | [`lib/dsh/socket.ts`](../apps/client/lib/dsh/socket.ts) `AuthenticatedSocket` | `websocket.connect(url, { headers: { Cookie } })` → EventTarget |
| 引导 | [`lib/dsh/auth.ts`](../apps/client/lib/dsh/auth.ts)                           | `/connect` 换 Cookie、`muxWebSocketUrl`、登录 URL 解析          |
| 装配 | [`lib/dsh/connection.ts`](../apps/client/lib/dsh/connection.ts)               | 官方 `installConnection` 的 `fetch` / `createWebSocket` 注入    |

`AuthenticatedSocket` 只把标准 `WebSocketConnection` 包成官方 dsh 要的 EventTarget 形状（`open` / `message` / `error` / `close`、`readyState`、`send`、`close`）；握手头与访问控制在 NSH 侧。

## 能力（`nsh.json` `capabilities.network`）

端口由 Host 每次启动重新分配，schema 只支持单一 `port` 或省略（任意端口），因此按 host 定规则、按方法与路径收窄：

| host        | methods | schemes      | 路径                         | 用途                    |
| ----------- | ------- | ------------ | ---------------------------- | ----------------------- |
| `127.0.0.1` | `GET`   | `http`       | `paths: ["/connect"]`        | 换 Cookie               |
| `127.0.0.1` | `GET`   | `http`, `ws` | `paths: ["/api/remote.mux"]` | 事件流（ws 握手按 GET） |
| `127.0.0.1` | `POST`  | `http`       | `pathPrefixes: ["/api"]`     | 全部 Remote 一元调用    |

`ws` 规则的握手在 NSH 里按 `GET` 的 `http`（或 `ws`）URL 校验，所以两条写法都放行同一 mux；未授权的 URL 由 NSH 以 `ERR_ACCESS_DENIED` 拒绝（`websocket.connect` 的 promise 直接 reject）。

## 已知限制：mux 心跳与阻塞的读取

长回复期间 mux 仍可能被 dsh 判死并重连一次。实测（本机 `dsh` 0.2.2-rc.3 + 安装版 NSH 0.6.0，用与 gateway 同参的本地 ws 服务对 `nsh test` 里的客户端复现；脚本不入库：它需要外部 ws 进程，且 `nsh test` 的 2s 调用预算只能把阻塞模拟成切片）：

| 一侧            | 行为                                                                                                            | 出处                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dsh gateway     | 每 2s 给每个 mux socket 发 ping，连续 2 次未收到 pong（也接受「收到的任何帧」与「未立即完成的写」）就 terminate | `packages/api/gateway/src/index.ts` `DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 2_000`、`src/stream-server.ts` `MAX_MISSED_HEARTBEATS = 2`（catalog 钉的 `0.2.2-rc.5`；该包自 `0.2.2-rc.3` 起源码逐字节相同，值未变） |
| NSH `websocket` | 「8 条消息或 8 MiB 未被 read 时，连接停止从网络读取」；协议层不再看到 ping                                      | 0.6 生成的 `apps/client/.nsh/types/websocket.d.ts`（`WebSocketConnection.read` 的注释）                                                                                        |

复现结果（NSH 0.6.0，每项 3 次一致）：积压 8 帧且无人 `read`、9.5s，gateway 在 ~7s terminate（socket 侧 1006，下一次 `read` 以 `EPROTO` 拒绝）；积压 2 帧、11.4s 不读，pong 照常回流，socket 存活；积压 8 帧但有一个 outstanding `read`（`AuthenticatedSocket` 的形状）、9.5s，也存活——那一个 `read` 让未读帧停在 7 条，连接继续从网络读取。结论与 0.5 时相同：触发条件是「未读队列满（≥8 条）+ 期间没有 `read` 把它腾空」，不是单纯空闲。

于是：JS 侧一次 ≳4s 的阻塞（大回复的整段重排、一次长渲染），且其间积压 ≥8 帧未读，mux 就会被判死 → 官方 connection 退避重连 → 新 generation → 官方 client model 以 **snapshot** 原子替换每个 Session 的事件窗口（不是 live 帧）。只有 2 帧积压时同样阻塞 10s，socket 存活（实测），所以触发条件是「队列满 + 阻塞」，不是单纯空闲。

两侧都在按设计工作，根治要么 dsh 心跳容忍慢读，要么 NSH 在队列满时仍答 ping：记为上游缺口，Client 侧只能减小暴露面并依赖官方自愈 ——

- ChatPane 把 live 文本按帧合批（`requestAnimationFrame`）。
- 重连不再由产品实现：`ctx.sessions` / `ctx.workspaces` 的 `RemoteStream` / `RemoteSnapshotStream` 按 Host generation 重开各自的逻辑流，每个 generation 的首帧替换整个窗口（`.controller.test.ts` 的「新 generation 替换窗口且不重复」覆盖产品侧投影）。产品只把 generation 丢失显示成一条提示，并在 Connection 被整条替换时重绑 controller（`SessionRegistry.rebind`）。

## 本地跑通

```sh
# 1) Host（独占 dsh 生命周期；版本钉 catalog + apps/host/supported-dsh.json）
cargo run -p myaid-host -- serve-app --port 4872

# 2) 客户端（没有 Host 时自己拉起；myaid-host 要在 PATH 上）
bun run dev        # 根目录：先核对依赖、必要时重建 Host，再起 Client
# Agent、脚本化验证与冒烟一律用 bun run dev --isolated=<name>（数据根 ~/.myaid-dev/<name>），不带它的 dev 读写真实的 ~/.myaid
# Settings ⇢ Background Services → Enable → 一条 Bot 的 Session
# 无 Host 时仍可用：export MYAID_DSH_LOGIN_URL='http://127.0.0.1:<port>/?token=…'
```

## 已落地

- `@deepseek-ai/dsh-*` Connection + Gateway + Session Remote，以及官方 client model `ctx.sessions` / `ctx.workspaces`（见 `lib/dsh/connection.ts`）。
- 控制面客户端（`lib/host/client.ts` 的 `fetch` / `WebSocket` + `serve-token`）与启动器（`lib/host/launcher.ts`）：Host 掉了之后由启动器重启、Client 重建 Connection（[ADR 0007](adr/0007-native-layer-after-lorca.md)）。
- `bun run prepare:sdk`（`scripts/prepare-sdk.mjs`）用 Node 条件打出 `lib/dsh/sdk.js`，并把官方 client model 的 ModuleLoader 工厂展开成静态 ESM（`lib/dsh/generated/`）；`nsh.json` `resolve.conditions: ["node"]` 兜底。勿直接依赖 `client.browser.js`（ModuleLoader 产物，无 ESM `installConnection`），也勿在运行期 eval 这些产物：NSH 发行版禁用 `Function` 构造器。

## 验证

- `nsh test`：`apps/client/lib/dsh/socket.test.ts`（握手头、EventTarget 语义、`nsh.json` 未授权 URL 的 `ERR_ACCESS_DENIED`）、`apps/client/lib/dsh/official-client.test.ts`（官方 client model 在 NSH 运行时里装载并驱动窗口 / Workspace 投影）。
- 真 Host：`screens/real-turn.smoke.test.tsx`（一条真实回复落地并收尾）、`screens/session-model.smoke.test.tsx`（两个 Panel 并发、排队撤回、审批往返、Host 中途重启后的窗口恢复、向上翻页）。
