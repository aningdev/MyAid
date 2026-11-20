# Rust 宿主约束

补充[根约束](../../AGENTS.md)。修改宿主、回环控制面、服务登记或 macOS 打包时适用。读 [ARCHITECTURE](../../docs/ARCHITECTURE.md)、[0006](../../docs/decisions/0006-host-is-the-only-background-service.md)、[0001](../../docs/decisions/0001-dsh-web-is-the-only-backend.md)。

## 模块与生命周期

- `DshProcess` 独占 dsh 生命周期；公开入口为 `Lifecycle`。内部锁、guardian、环境与日志保持私有。
- `local_api` 是本机控制面（照 lorca 的 `ws.rs`）：`127.0.0.1:<port>` 的 HTTP 路由 + `/watch` WebSocket，`Origin` / 非本端口 `Host` 403，`serve-token` 作 Bearer（`/` 免 token，只回 `dsh-bot`）。**只调用** `Lifecycle`、`service` 与 `bridge`，不另建启停策略。
- `bridge`（`src/bridge/`）拥有注册身份、Relay 连接、Noise、已配对 Device、`/bridge/pairing` 与 `/bridge/devices`，以及 Device 流量到 dsh web 的转发（`POST /api/…`、`/api/remote.mux`）。帧契约在 [relay-tunnel](../../docs/architecture/relay-tunnel.md)，这里不复述。Cookie 只经 `/connect` 用登录 token 换取并按 origin 与 generation 缓存；dsh 访问走 `dsh.rs` 的 seam（`DshSource` 由 `local_api` 从 `Lifecycle` 提供），`bridge` 不依赖 `dsh_process`。测试里的假 Relay 与假 dsh web 只服务本 crate，不依赖 `apps/relay`。
- `service`（`src/service/`）是 Host 自己的 OS 登记：launchd plist、systemd 单元、Windows Run 键与 `service run` 监督器。登记快照只含 Host 的 `version`、`phase` 和可选 `reason`。测试只快照计划，**不安装**。
- `main.rs` 只装配与分派（`serve-app` / `serve` / `guardian` / `service`）；`lib.rs` 导出 Client 与控制脚本用的共享形状。
- 公开状态形状集中在 `local_api/status.rs`（含 `recovering` 等相位）；修改时同时核对 Client 解码（`apps/client/lib/host/protocol.ts`）与 fixture（`testdata/host-contract-cases.json`）。公开 status 与 `GET /connection` 分离。

## 后台身份

- UI 退出不停止已接纳工作：App 退出只结束它启动的 Host 子进程；长期后台由 `service` 登记的那份负责。
- 目标经 `service` 登记本机常驻（launchd / systemd / Windows Run 键）；NSH 决定产品顺序，Rust 返回系统调用事实。
- 不因组件缺失恢复「客户端自行 spawn dsh」的回退路径：Host 是唯一 owner，Client 只经 `local_api` 通知它。

## 联调与成品

- 控制面与协议修改验证真实 HTTP：`cargo test -p dsh-bot-host`（含未认证拒绝、页面/外部 Host 拒绝、登记事实、`/watch` 升级），以及 `apps/host/scripts/smoke-control.mjs`。
- `launchctl` / `systemctl` / `reg` 的注册 / 批准 / 注销以真机为准；`cargo test` 只证明计划文本。
