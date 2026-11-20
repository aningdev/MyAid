# 0003 其他 Device 经零知识 Relay 连到 Runner

## Context

所有工作都在 Runner 上执行，但手机、平板和浏览器也要能用，而且不能要求 Owner 自己准备网络：不开端口、不配域名或证书、不装 VPN。

## Decision

- Runner 上的 Host 内置 **Bridge**，主动向外连 **Relay**，所以 NAT 后面也能用。
- Device 和 Bridge 在 **Pairing** 时交换长期公钥。之后每一帧都端到端加密，Relay 只看得到 Device 公钥和密文。
- Bridge 解开帧之后，用它自己的 Cookie 代为请求本机回环上的 dsh web。Device 永远拿不到 dsh 的凭据。
- Client 用 Carrier seam 统一两种连接：Runner 上的 Client 走 loopback，其他 Device 走 relay tunnel。两种都是给官方 `installConnection` 注入 `fetch` 和 `createWebSocket`，Client 的其余部分不区分。
- 所有已配对的 Device 都等同于 Owner，撤销只在 Runner 上做。
- 默认 Relay 由项目运营；Owner 也可以用 `DSH_BOT_RELAY_URL` 换成自建的。Relay 可以同时托管 web 版 Client 的静态文件。

## Why

只有这样才能做到不用 Owner 准备网络，同时 Relay 运营方读不到任何内容。lorca 用的也是这种做法。

## Rejected

- **`dsh web --public-url` 加反向代理**：需要 Owner 自己有公网入口和证书。
- **第三方隧道（cloudflared、Tailscale Funnel）**：要单独注册账号，而且隧道提供方能看到明文 HTTP。
- **dsh liveshare / remote-access**：它解决的是邀请非 Owner 的人参与，不是 Owner 自己的多台设备。
