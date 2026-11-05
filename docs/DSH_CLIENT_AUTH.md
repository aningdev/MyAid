# MyAid ↔ dsh 本机认证（NSH 0.4）

**Verdict：** NSH 0.4 **仍拒绝**标准 WebSocket 握手上的 `Cookie` / `Authorization`。官方客户端连 `/api/remote.mux` 必须走原生 `CookieWebSocket`。

## 代码落点

| 层       | 路径                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| 原生模块 | `apps/client/src/cookie_websocket/` → `myaid/native` 的 `CookieWebSocket` / `Socket` |
| TS 适配  | `apps/client/lib/dsh/socket.ts`（`AuthenticatedSocket`）                             |
| 引导     | `apps/client/lib/dsh/auth.ts`（`/connect` 换 Cookie → mux）                          |

数据根：`~/.myaid`（`DSH_HOME`）。控制 socket：`~/.myaid/host/control.sock`。

## 本地跑通

```sh
# 1) Host（独占 dsh 生命周期；版本钉 apps/host/supported-dsh.json）
cargo run -p myaid-host -- serve --data-root ~/.myaid --official-dsh

# 2) 客户端（MYAID_HOST_SOCKET 已由 dev 脚本注入）
vp run @myaid/client#dev
# Dialogue → Context →「启动后台」→ connectionInfo → Session
# 无 Host 时仍可用：export MYAID_DSH_LOGIN_URL='http://127.0.0.1:<port>/?token=…'
```

`nsh.json` 已授权 `127.0.0.1`；dsh 必须绑回环。

## Smoke：标准 WS 必败 vs CookieWebSocket

在 NSH 运行时（或临时脚本）调用：

```ts
import { smokeDshAuthTransport } from "./lib/dsh";

const result = await smokeDshAuthTransport();
// result.standardRejection 含 Cookie / credential
// CookieWebSocket 对同一 mux URL 应 open 成功
```

对照步骤：

1. `websocket.connect(muxUrl, { headers: { Cookie: 'probe=1' } })` → **必须拒绝**（0.4 仍拒绝凭据头）。
2. `fetch(origin/connect?token=…&interactions=answer, { redirect: 'manual' })` → 302 + `Set-Cookie`。
3. `CookieWebSocket.connect('ws://127.0.0.1:<port>/api/remote.mux', cookie)` → **必须成功**（或至少完成握手；官方 Mux 帧另需 Gateway）。

故意跳过原生适配、只把 Cookie 塞进标准 `connect`，应无法建立官方 remote 通道。

## 已落地

- `@deepseek-ai/dsh-*` Connection + Gateway + Session Remote（见 `lib/dsh/connection.ts`）。
- HostControl 原生 Unix 适配（`myaid/native` `HostControl`）与 `lib/host/control.ts`。
- `bun run prepare:sdk`（`scripts/prepare-sdk.mjs`）用 Node 条件打出 `lib/dsh/sdk.js`；`nsh.json` `resolve.conditions: ["node"]` 兜底。勿直接依赖 `client.browser.js`（ModuleLoader 产物，无 ESM `installConnection`）。

## 有意未做

- 按蓝图把会话认领到 Bot。客户端仍使用固定 `myaid-primary`，直至按该模型接线。
- Bridge / Relay / `SMAppService` 成品登记。
