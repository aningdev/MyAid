# 0010 Device 的密钥和配对记录存在 NSH Storage 里

取代 [0009](0009-the-device-key-lives-in-the-data-root.md)。

## Context

0009 把 Device 的静态私钥和配对记录搬到数据根下的 `device/*.json`，要求权限是 0600。实现时发现 NSH 的 `fs` 没有 `chmod`，`writeFile` 和 `mkdir` 也不收 mode，文件权限只能随 umask，通常是 0644。macOS 的 home 目录对 `staff` 组可读，于是本机的其他用户能读到这把私钥，达不到 lorca 的 0600。

NSH Storage 每个 app 一份 `storage.json`，位置由平台决定：macOS 是 `~/Library/Application Support/<app id>/`（`~/Library` 是 0700），iOS 和 Android 在 app 的私有容器里，Windows 在按用户授权的 `%APPDATA%`，Linux 在 `~/.local/share`，web 在浏览器的 `localStorage`。

## Decision

- 所有端的 Device 静态私钥和配对记录都存在 NSH Storage 里，键是 `dsh-bot.device.identity` 和 `dsh-bot.device.pairing`，记录格式不变。
- 读写只经 `DeviceStore`。产品只有 NSH Storage 这一种实现，测试用内存实现。数据根下不再有 `device/`。
- 按 0009 写进数据根的文件不读也不迁移。找不到记录的 Device 生成新身份，并重新配对。

## Why

- 在 macOS 和移动端，Storage 所在的目录只有本用户或本 app 能进，比数据根里 0644 的文件严。
- 所有端只有一种实现，不需要按平台选择。
- 私钥仍是明文。泄露后的补救办法不变：在 Runner 上撤销这台 Device。等 NSH 提供 keychain 或设置权限的手段后再考虑加强。

## Consequences

- 删掉数据根不会清掉 Device 的身份和配对，要清掉它们得在「这台设备」里断开，或者在 Runner 上撤销。
- `storage.json` 损坏时 NSH 会把它改名为 `storage.json.corrupt`，用空的 Storage 启动，这时 Device 要重新配对。
- `--isolated` 的开发运行和正式的 app 用同一个 app id，在同一台机器上共用这份 Storage。

## Rejected

- **数据根里的文件（0009）**：NSH 设不了权限，私钥对本机其他用户可读。
- **用口令加密私钥**：理由同 0009，每次启动都要输入口令，而撤销已经能处理泄露。
