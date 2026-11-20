# 0009 Device 的密钥和配对记录存在数据根里

## Context

[0008](0008-the-relay-tunnel-speaks-noise-over-a-stateless-relay.md) 把 Device 的 X25519 私钥放在 NSH Storage 里。这样一来，同一台机器上有两份 Device 数据：偏好在数据根的文件里，身份却在 NSH Storage 里，备份、迁移、排查都要分开找。NSH 没有 keychain API。lorca 是这样做的：每台机器的密钥是 `~/.lorca/machine.json` 一个文件，只有本用户能读写。

## Decision

- Device 的静态私钥存在 Device 数据根下的 `device/identity.json`，配对记录存在 `device/pairing.json`。数据根就是 Client 的数据根：`$DSH_BOT_HOME`，默认 `~/.dsh-bot`。
- 两个文件都用原子替换写入，权限设为只有本用户可读写（0600）。
- 没有文件系统的端（web 版）仍然用 NSH Storage。规则和 Device 偏好一样：有数据根就用文件。
- 不迁移 NSH Storage 里已有的密钥。找不到密钥的 Device 生成新身份，并重新配对。

## Why

- 一台 Device 的数据都在一个目录里，Owner 删掉或备份这个目录就够了，和 lorca 的做法一致。
- 私钥仍是明文。它泄露后的补救办法不变：在 Runner 上撤销这台 Device。密钥加密存储留到 NSH 提供 keychain 之后再考虑。

## Rejected

- **继续用 NSH Storage**：数据分两处，而且 Storage 的位置和权限由 NSH 决定，Owner 看不到也管不了。
- **用口令加密私钥**：每次启动都要输入口令；而撤销已经能处理泄露。
