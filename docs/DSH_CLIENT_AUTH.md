# MyAid ↔ dsh 本机认证

dsh 只绑回环（Host 以 `dsh web --host 127.0.0.1 --port 0` 启动，端口由 dsh 选）。认证两步，之后同一条 Cookie 既走 HTTP 也走 WebSocket：

1. `GET http://127.0.0.1:<port>/connect?token=…&interactions=answer` → `302` + `Set-Cookie`（`redirect: "manual"`，token 不落盘）。
2. 官方 dsh 客户端的所有调用带该 Cookie：Remote 一元调用是 `POST /api/<endpoint>`，事件流是 `ws://127.0.0.1:<port>/api/remote.mux`。

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

## 本地跑通

```sh
# 1) Host（独占 dsh 生命周期；版本钉 apps/host/supported-dsh.json）
cargo run -p myaid-host -- serve --data-root ~/.myaid --official-dsh

# 2) 客户端（MYAID_HOST_SOCKET 已由 dev 脚本注入）
vp run @myaid/client#dev
# Dialogue → Context →「启动后台」→ connectionInfo → Session
# 无 Host 时仍可用：export MYAID_DSH_LOGIN_URL='http://127.0.0.1:<port>/?token=…'
```

## 验证

- `nsh test`：`apps/client/lib/dsh/socket.test.ts`（握手头、EventTarget 语义、`nsh.json` 未授权 URL 的 `ERR_ACCESS_DENIED`）。
- 真 Host：登录 → mux 连接 → 发一条 prompt 拿到回复。

## 已落地

- `@deepseek-ai/dsh-*` Connection + Gateway + Session Remote（见 `lib/dsh/connection.ts`）。
- HostControl 原生 Unix 适配（`myaid/native` `HostControl`）与 `lib/host/control.ts`。
- `bun run prepare:sdk`（`scripts/prepare-sdk.mjs`）用 Node 条件打出 `lib/dsh/sdk.js`；`nsh.json` `resolve.conditions: ["node"]` 兜底。勿直接依赖 `client.browser.js`（ModuleLoader 产物，无 ESM `installConnection`）。
