---
status: accepted
---

# 本机层照 lorca：Host 是 CLI，Relay 照 relay crate，Client 没有 Rust

产品后台仍由 **Host** 与 **Relay** 两个对等常驻进程组成（[ADR 0002](0002-dual-background-services.md)），但本机层的**机制**改以仓库内只读参考 [lorca](../../references/lorca) 为准：Host 扮演 lorca 的 `lorca serve`（差别只在它监督官方 `dsh web`，不跑自己的 agent），Relay 照 `crates/relay` 的结构，Client 与它们之间只走回环 HTTP / WebSocket。本文取代 ADR 0002 里与本机机制有关的部分（控制面形状、OS 登记方式、Client 原生适配）；「两个单元、各自存活、半启用降级」的产品结论不变。

## 决定

1. **控制面是回环 HTTP**。Host 监听 `127.0.0.1:4872`（`MYAID_HOST_PORT` / `--port` 覆盖），Relay 监听 `127.0.0.1:8787`（`MYAID_RELAY_PORT`）。路由照 lorca：`/` 回 `myaid` 作为探活文本，`GET /status`、`GET /connection`、`POST /dsh/start|stop|restart`、`GET /registration`、`POST /registration/enable|stop`、`GET /watch`（WebSocket 推公开状态）。Relay 多一个 `GET /v1/health`，登记路由与 Host 同形。
2. **认证照 lorca**。数据根的私有运行目录里有 `serve-token`（32 字节随机、0600，进程拿到端口后写一次并复用）。除 `/` 外每个请求要 `Authorization: Bearer <token>`，常量时间比较；带 `Origin` 的请求（网页的）或 `Host` 不是本端口回环的请求一律 403。`/watch` 的 token 允许走查询串，因为标准 WebSocket API 不能设请求头；该端点只推公开状态（无登录 URL）。
3. **Client 没有 Rust**。`apps/client` 回到纯 TSX：`nsh.json` 去掉 `"rust"`，crate 与 `src/` 删除，`host_control` / `relay_control` / `shell_demo` 一并消失；控制面改用标准 `fetch` / `WebSocket`（`apps/client/lib/host/client.ts`）。`nsh.json` 的 `network` 只授予回环上的这些路径与 dsh 自己的 `/connect`、`/api/*`；`process.execute` 只授予 `myaid-host`。
4. **启动器照 lorca 的 app**。App 启动时先探 `/`：有 Host 就复用（不 spawn），没有就 spawn `myaid-host serve-app --port <port>`；子进程退出后按 1 秒起、翻倍到 15 秒的退避重启，一次就绪后退避复位。二进制找不到、启动失败、始终不应答时，侧栏页脚就是 Host 空状态：启动器的原因 + 手动的 `myaid-host serve-app`。
5. **OS 登记照 lorca 的 `service.rs`**。Host 与 Relay 各自有 `service` 模块：macOS 写 `~/Library/LaunchAgents/com.myaid.{host,relay}.plist` 并 `launchctl bootstrap`，Linux 写 systemd 用户单元（`myaid-host.service` / `myaid-relay.service`），Windows 写 `HKCU\…\Run` 指向 `<exe> service run` 监督器。两个单元共用的 launchd plist / systemd 单元 / Run 命令行文本放在薄 crate `crates/myaid-service`（见「与 lorca 的差异」）。`crates/myaid-background-service` 删除。
6. **Relay 只落结构与常驻机制**：配置、日志（`tracing` + `RUST_LOG`）、启动/优雅停止、`/v1/health`、登记路由、`service` 模块。身份密钥、配对、密文转发**本轮不做**；移动端开始时照 lorca 的 `identity` / `pairing` / relay 协议补。

## 与 lorca 的对应

| lorca                                                                            | 我们                                                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `crates/cli/src/ws.rs`（`/` + `/ws`、Origin/Host 校验、Bearer、`serve-token`）   | `apps/host/src/local_api/{mod,routes,auth}.rs`                                                                 |
| `crates/cli/src/config.rs` 的 `serve-token` / 端口 / home                        | `apps/host/src/config.rs`、`apps/relay/src/config.rs`                                                          |
| `crates/cli/src/service.rs`（launchd / systemd / Run 键 + `service run` 监督器） | `crates/myaid-service/src/service.rs`，由 `apps/host/src/service.rs`、`apps/relay/src/service.rs` 各自命名单元 |
| `desktop/launcher.go`（探端口 → 启动 → 退出后退避重启 → 空状态）                 | `apps/client/lib/host/launcher.ts`、`components/shell/HostFooter.tsx`                                          |
| `desktop/client.go`（读 token、重连）                                            | `apps/client/lib/host/client.ts`（`fetch` + `WebSocket`）                                                      |
| `crates/relay/{main,routes,db,run}.rs`、`--bind` / `--db` / `RUST_LOG`           | `apps/relay/{main,routes,run}.rs`、`config.rs`（无 db）                                                        |
| `lorca service install                                                           | uninstall                                                                                                      | status` | `myaid-host service install | uninstall | status`、`myaid-relay service …` |

## 与 lorca 的差异（与控制面无关的产品约束）

- **Host 不跑 agent**：dsh 仍是唯一执行面；Host 只拥有它的生命周期、登录 URL 与登记事实（[DSH_PRINCIPLES](../DSH_PRINCIPLES.md)）。
- **端口只有一套**：lorca 的 app 分发布版 4862 / 开发版 4863（两套数据根与 bundle id）；我们只有一个应用标识与一个数据根，所以 `4872` / `8787` 一套默认值 + 环境变量覆盖。
- **`/watch` 的 token 走查询串**：lorca 的客户端（Go）能设握手头，NSH 的标准 `WebSocket` 不能，因此该端点同时接受查询串 token；它只推公开状态。
- **多一个共享 crate**：`crates/myaid-service` 只放两个单元逐字相同的 plist / systemd / Run 文本与登记动词，差额只是单元名、参数与日志名。两份复制粘贴会让一台机器上的两个单元登记方式漂移，故保留这一薄层，而不是 ADR 0002 那种「Client 编排的双单元契约」crate（那份契约现在只剩线上形状 `registration.rs`）。
- **命令改名**：lorca 的 `lorca serve` 是「带身份与会话的服务」；我们的 `myaid-host serve-app` 是「产品数据根 + 钉住的 dsh」，`serve --data-root …` 是隔离/开发入口。两者都对 launcher 报 `{"event":"ready","port":N}`（`--ready-stdout`）。
- **Relay 没有数据库**：转发面还没开始，先不引入 schema；`db` 随后续身份/配对一并落地。

## 后果

- Client 的「Host 掉了」不再靠 dsh mux 的换代信号（它会一直重试旧登录 URL）：启动器报告退出时，Client 丢掉当前 Connection 并走既有重连路径，新 Host 的就绪再触发一次探活。为此 `Connection.dispose()` 的 fiber 释放有 3 秒上限——对已消失 Host 的拆卸不能卡住下一次连接。
- OS 登记不再依赖签名成品里的 `SMAppService` 辅助程序：任何能运行的 `myaid-host` / `myaid-relay` 都能把自己登记成登录常驻（开发态同理），登记文档与验收随之改写。
- 关闭 App 会结束它自己启动的 Host 子进程（NSH 拥有子进程）；真正的「关 UI ≠ 关本机」由 OS 登记的那份服务承担，与 lorca 一致。
- 插件的 `--patch` 等开发期变量不进服务定义：服务只带数据根与端口。

用词见根 [GLOSSARY.md](../../GLOSSARY.md)（Host、Relay、Background Service、HostControl）。
