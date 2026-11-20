# 0007 Client 是纯 TSX，只和 Carrier 与自己的数据打交道

## Context

NSH 可以带 Rust 原生层。Client 需要覆盖 macOS、Windows、Linux、iOS、Android 和 web，而 Host 已经是 Rust。

## Decision

- Client 是纯 TSX 的 NSH 应用，不带 Rust crate，保持 NSH 生成的目录结构。
- Runner 上的 Client 通过本机控制面（回环 HTTP 加 WebSocket，Bearer 是 `serve-token`）管理 Host，生命周期照 lorca 的 launcher。
- Client 只读写 dsh-bot 自己的数据：文件系统权限只授予数据根，网络权限只授予回环和 Relay，进程权限只授予 `dsh-bot-host`。

## Why

一份 TSX 代码就能覆盖所有平台。只有桌面需要的原生能力已经都在 Host 里。

## Rejected

- **给 Client 加 Rust 原生层**：移动端和 web 用不了，等于多一套平台分支。
