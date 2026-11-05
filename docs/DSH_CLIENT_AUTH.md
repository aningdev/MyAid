# MyAid ↔ dsh 本机认证（NSH 0.4）

**Verdict：** NSH 0.4 **仍拒绝**标准 WebSocket 握手上的 `Cookie` / `Authorization`。官方客户端连 `/api/remote.mux` 必须走原生 `CookieWebSocket`（见 Project 文档 `docs/nsh04-dsh-auth-integration.md`）。

## 代码落点

| 层       | 路径                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| 原生模块 | `apps/client/src/cookie_websocket/` → `myaid/native` 的 `CookieWebSocket` / `Socket` |
| TS 适配  | `apps/client/lib/dsh/socket.ts`（`AuthenticatedSocket`）                             |
| 引导     | `apps/client/lib/dsh/auth.ts`（`/connect` 换 Cookie → mux）                          |

数据根：`~/.myaid`（`DSH_HOME`）。控制 socket 约定：`~/.myaid/host/control.sock`（Host `connectionInfo` 尚未实现时用环境变量）。

## 本地跑通

```sh
# 1) 官方 dsh（本机已安装；版本钉见 apps/host/supported-dsh.json）
DSH_HOME=~/.myaid dsh web --host 127.0.0.1 --port 0 --no-open
# ready 行给出 http://127.0.0.1:<port>/?token=…

# 2) 客户端（保留 AppShell；认证库可被设置页/探针调用）
export MYAID_DSH_LOGIN_URL='http://127.0.0.1:<port>/?token=<token>'
bun run --cwd apps/client dev
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

## 有意未做

- 未嵌入完整 `@deepseek-ai/dsh-*` Gateway / Session Controller（体积与产品范围另开）。
- HostControl 原生 Unix 适配仍待 Host `serve` 实现；当前用 `MYAID_DSH_LOGIN_URL`。
