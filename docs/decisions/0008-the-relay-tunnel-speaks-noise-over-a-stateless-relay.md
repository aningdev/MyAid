# 0008 Relay 隧道用 Noise 协议，Relay 不留状态

## Context

[0003](0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md) 定了「Bridge 主动外连 Relay、端到端加密、Relay 零知识」，但没定具体的协议。约束有四条：

- NSH 原生端没有 WebCrypto，Client 只能用纯 JS 密码库。
- NSH 原生端不能扫码，配对信息只能由系统相机或剪贴板带进 Client。
- 所有工作都在 Runner 上做，Runner 不在线时 Device 本来就什么都做不了。
- dsh 的 mux 每 2 秒心跳一次，Device 网络一慢就会断（见 [dsh-connection](../architecture/dsh-connection.md#已知限制mux-心跳和读取阻塞)）。

## Decision

- **端到端加密**用 Noise：日常连接用 `Noise_IK_25519_ChaChaPoly_SHA256`，配对用 `Noise_IKpsk1_25519_ChaChaPoly_SHA256`（psk 在第 1 条消息就参与运算，Bridge 登记 Device 之前就能验证它）。Device 从配对链接里拿到 Runner 的静态公钥和一次性 psk。Bridge 用 Rust 的 `snow`；Client 在 `@noble/curves`、`@noble/ciphers`、`@noble/hashes` 上自己实现，并用公开测试向量校验。
- **Relay 不留状态**：它只在内存里路由，不落盘、不排队、不暂存。Runner 用 Ed25519 密钥签 challenge 来登记，runner id 由这个公钥派生。每条 Device 连接由 Relay 分配一个通道号，Relay 连 Device 公钥都看不到。Runner 不在线就立即拒绝。
- **隧道里运送 HTTP 和 WebSocket 流**，不重新设计一套 Remote 协议。Bridge 只放行 dsh web 的 `/api` 路径，用它自己的 Cookie 访问回环，并在本机回应 dsh 的 mux 心跳。
- **Device 私钥存在 NSH Storage 里**：NSH 没有 keychain API。私钥泄露的补救办法是在 Runner 上撤销。

## Why

- Noise IK 一个来回就能握手，两边身份都得到认证，还有前向保密。它有现成的 Rust 实现和测试向量，JS 那边只要实现一个很小的子集。
- 不留状态的 Relay 运营成本最低，自建也最简单，而且 Runner 离线时多存一份也没有用处。
- 在隧道里运送原样的 HTTP 和 WS，官方 `installConnection` 的 Carrier seam 就能直接复用，dsh 升级时隧道不用跟着改。

## Rejected

- **libsodium sealed box 逐条加密**（lorca 的做法）：没有前向保密，防重放和会话管理都得自己做；原生端也没有 libsodium。
- **Noise XX**：要多一个来回，而 Device 本来就从配对链接里知道 Runner 的公钥。
- **隧道内跑 TLS**：NSH 不提供能跑在自定义传输上的 TLS 客户端。
- **Relay 存储转发**（lorca 的 blob 模型）：需要存储和清理策略，换来的只是在 Runner 离线时排队，而这时排队并没有意义。
- **WebRTC 直连**：需要 STUN/TURN，NSH 也没有 WebRTC。
