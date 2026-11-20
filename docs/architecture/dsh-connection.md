# dsh 连接

Client 访问 dsh web 的唯一途径是 `lib/dsh` 的 Connection。它在一条 Cordis Context 上装好官方 client model（`ctx.sessions`、`ctx.workspaces`、文件上传），再挂载产品用到的 Remote。具体走哪条线路由 Carrier 决定。

## Carrier

官方 `installConnection(ctx, options)` 支持由外层提供载体：Carrier 提供 `fetch`、`createWebSocket` 和 `streamBaseUrl`，其余逻辑（Remote 一元调用、`/api/remote.mux` 事件流、重连、generation 切换）都归官方。

| Adapter    | 用在哪             | 认证                                                                                                                                              |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loopback` | Runner 上的 Client | Host 给出登录 URL，Client 自己用 `/connect` 换 Cookie（见下文）                                                                                   |
| `relay`    | 其他 Device        | Device 不持有 dsh 凭据：请求和 WebSocket 帧端到端加密后经 Relay 交给 Bridge，Bridge 用它自己的 Cookie 访问回环（[relay-tunnel](relay-tunnel.md)） |

## loopback 认证

dsh 只绑回环（Host 以 `dsh web --host 127.0.0.1 --port 0` 启动，端口由 dsh 选）。认证分两步，之后同一枚 Cookie 同时用于 HTTP 和 WebSocket：

1. `GET http://127.0.0.1:<port>/connect?token=…&interactions=answer`，返回 `302` 加 `Set-Cookie`。请求用 `redirect: "manual"`，token 不落盘。
2. 之后所有调用都带上这枚 Cookie：Remote 一元调用是 `POST /api/<endpoint>`，事件流是 `ws://127.0.0.1:<port>/api/remote.mux`。

### 只带自己的 Cookie

绝不能让 dsh 看到平台的 cookie jar。NSH 的 `fetch` 默认会带上系统 jar，而 dsh 每次 `/connect` 都会新发一枚 `dsh-auth-<random>`，jar 会把历史上所有这些 Cookie 一起发回去。实测有一次 `/connect` 带了 57 枚旧 Cookie（16 KB），dsh 直接回 `431 Request Header Fields Too Large`。在原生栈上光设 `credentials: "omit"` 关不掉它，必须**显式设置 `Cookie` 头**（空串也行）。

所以 `lib/dsh/auth.ts` 的 `dshRequestInit()` 是所有 dsh HTTP 调用的唯一入口：它设置 `credentials: "omit"`，并且总是设置 `Cookie`（`/connect` 时为空串，之后是 dsh 发的那枚）。`lib/dsh/auth.test.ts` 钉住这两点。WebSocket 握手本来就带显式 `Cookie`，同样不会带上 jar。

### 各层

| 层        | 路径                                      | 职责                                                                                                                                                                        |
| --------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebSocket | `lib/dsh/socket.ts` `AuthenticatedSocket` | `websocket.connect(url, { headers: { Cookie } })`，再包成官方要的 EventTarget 形状（`open` / `message` / `error` / `close`、`readyState`、`send`、`close`）                 |
| 引导      | `lib/dsh/auth.ts`                         | 用 `/connect` 换 Cookie、生成 `muxWebSocketUrl`、解析登录 URL                                                                                                               |
| 装配      | `lib/dsh/connection.ts`                   | 把 Carrier 注入 `installConnection`                                                                                                                                         |
| SDK       | `lib/dsh/sdk.ts` → `prepare:sdk`          | 按 Node 条件打出 `sdk.js`，并把官方 client model 的 ModuleLoader 工厂展开成静态 ESM（`lib/dsh/generated/`）。NSH 发行版禁用 `Function` 构造器，所以运行时不能 eval 这些产物 |

## 能力授权（`nsh.json` `capabilities.network`）

端口每次启动都会重新分配，而 schema 只能写死一个 `port` 或者不写（任意端口），所以规则按 host 来定，再按方法和路径收窄：

| host        | methods | schemes      | 路径                         | 用途                         |
| ----------- | ------- | ------------ | ---------------------------- | ---------------------------- |
| `127.0.0.1` | `GET`   | `http`       | `paths: ["/connect"]`        | 换 Cookie                    |
| `127.0.0.1` | `GET`   | `http`, `ws` | `paths: ["/api/remote.mux"]` | 事件流（ws 握手按 GET 校验） |
| `127.0.0.1` | `POST`  | `http`       | `pathPrefixes: ["/api"]`     | Remote 一元调用              |

Host 的控制面（`/`、`/status`、`/connection`、`/watch`、`/dsh/*`、`/registration*`）另有规则。公网 Relay 不在本机控制面里。未授权的 URL 会被 NSH 以 `ERR_ACCESS_DENIED` 拒绝。

## 已知限制：mux 心跳和读取阻塞

| 一侧            | 行为                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| dsh gateway     | 每 2 秒给每个 mux socket 发 ping，连续 2 次没收到 pong 就断开（`DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 2_000`、`MAX_MISSED_HEARTBEATS = 2`） |
| NSH `websocket` | 未读消息达到 8 条或 8 MiB 时，停止从网络读取，协议层也就收不到 ping                                                                             |

所以，如果 JS 侧阻塞了 4 秒以上，同时积压了 8 帧以上没读，mux 就会被判定断开。之后官方 connection 退避重连，生成新的 generation，官方 client model 用 snapshot 整体替换每个 Session 的事件窗口。只积压 2 帧时，即使阻塞 10 秒连接也不会断。`AuthenticatedSocket` 始终挂着一个待完成的 `read`，这能让未读帧停在 7 条。这是上游的缺口，Client 只能尽量少触发：

- ChatPane 用 `requestAnimationFrame` 合并 live 文本的渲染。
- 重连完全由官方 client model 处理。产品侧只把 generation 丢失显示成一条提示，并在整条 Connection 被替换时重新绑定 controller（`SessionRegistry.rebind`）。

## 验证

- `nsh test`：`lib/dsh/socket.test.ts`（握手头、EventTarget 语义、未授权 URL 的 `ERR_ACCESS_DENIED`）、`lib/dsh/official-client.test.ts`（官方 client model 在 NSH 运行时里装载并驱动事件窗口）。
- 真 Host 冒烟：`screens/real-turn.smoke.test.tsx`、`screens/session-model.smoke.test.tsx`（两个 Pane 并发、排队撤回、审批往返、Host 重启后窗口恢复、向上翻页）。
