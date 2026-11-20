# Personal Agent 覆盖全端

2026-11-20

## Why

Owner 想要一个属于自己的 Agent：能力始终和 DeepSeek Harness 同步，不管拿着哪台设备都能找到它，它还能把工作交给专门的 Bot 去做。现在的 MyAid 只是一个桌面 Bot 应用：Registry 只存在桌面上，手机连不上，Bot 之间也不能互相派活。`references/dsh-superagent-prototype` 证明了在 dsh 上「接请求 → 开 Ticket → 在独立 Session 里执行 → 回复到请求来源」这条路是走得通的。dsh-bot 要把这条路做成个人版。

原则沿用原型的：**占用 Owner 尽量少的注意力，带来尽量多的价值**。只有被请求时才动手；只在需要 Owner 决定或有结果可用时才开口。

## Goal

Owner 在任何一台 Device 或已接入的 Source 上提出请求，Main Bot 都能接住，自己完成或开成 Ticket 交给合适的 Bot。Owner 在任何 Device 上都能看到进展、回答 Attention、接手工作，不需要自己准备任何网络设施。

## Out of scope

- 多人或团队使用：邀请他人、团队 Policy、admission 表
- 跨 Source 关联同一个人的不同账号
- 在 Runner 以外的设备上执行工作（手机不跑 dsh）
- 自定义模型供应商、Bot 市场
- dsh 自带的 Web GUI 和 DeepSeek 品牌界面
- 没人请求时主动开始工作（原型里的 inferred / auto 模式）

## Acceptance criteria

1. **改名完成**：仓库、包、二进制、环境变量和数据根都改成 dsh-bot 的名字，代码里找不到旧名。
   例：`rg -i myaid --glob '!references/**' --glob '!docs/decisions/**' --glob '!docs/specs/**'` 没有结果（decision 和 spec 是带日期的记录，保留旧名）；`bun run dev --isolated=a` 用的数据根是 `~/.dsh-bot-dev/a`。_automated_
2. **跟随 dsh**：catalog、`supported-dsh.json` 和子模块 tag 中任何一处与其他两处不一致，`bun run check` 就失败。
   例：把子模块切到 `dsh-v0.2.2-rc.4`，check 报出三处的版本差异。_automated_
3. **Main Bot 一直在**：全新数据根第一次启动后，Navigator 第一个就是 Main Bot，它不能被归档或删除。
   例：在 Main Bot 的详情里看不到「归档」和「删除」；调用 `bots` Remote 删除它会被拒绝。_automated_
4. **Registry 全端一致**：在一台 Device 上新建或修改 Bot，另一台已配对 Device 不用刷新就能看到。
   例：手机上把一个 Bot 改名为「研究员」，Runner 桌面的 Navigator 在几秒内更新。_manual_
5. **委派可见**：Owner 让 Main Bot 做一件需要其他 Bot 的事时，Main Bot 开出 Ticket，Ticket 出现在执行它的 Bot 下，Owner 可以打开它的 Session 看过程并发消息介入。
   例：对 Main Bot 说「让研究员查一下 X」，研究员下出现一个运行中的 Ticket；在里面追加「只要 2025 年以后的资料」，执行随之调整；结束后 Main Bot 在 Dialogue 里汇报结果。_manual_，Ticket 的生命周期 _automated_
6. **Attention 全端可达**：Ticket 需要 Owner 回答时，每台 Device 都能看到这条 Attention，在任何一台上回答后，其他 Device 上的同一条 Attention 都会消失。
   例：Ticket 问「两个方案选哪个？」，在手机上选了 A，桌面上这条 Attention 随即消失，Ticket 继续执行。_manual_
7. **无需自备网络**：手机在蜂窝网络下扫 Runner 上的二维码配对后，可以和任意 Bot 对话；Runner 在家用 NAT 后面，没有开放任何端口。
   例：关掉手机 Wi-Fi 后给 Main Bot 发消息，回复以流式显示。_manual_
8. **Relay 看不到内容**：Relay 收到的每一帧都只有 Device 公钥和密文。
   例：Relay 的测试把一次完整对话中经过的所有帧录下来，在其中找不到对话里的任何明文片段。_automated_
9. **撤销立即生效**：在 Runner 上撤销一台 Device 后，它的下一次请求就会被拒绝，它必须重新配对。
   例：撤销手机后，手机上发出的消息显示「这台设备已被移除」。_automated_
10. **Source 请求**：Owner 在一个已接入的 IM Source 里 @ 自己的 dsh-bot，Main Bot 确认一次，完成后把结果回复到同一个会话里；其他人的消息不会开出 Ticket。
    例：飞书群里 Owner 发「@bot 总结今天的 PR」，bot 回「好的，正在处理」，之后回复总结；同事发同样的话，没有任何反应。_automated_（用 fake Source），真实 IM 为 _manual_

## Open questions

- 移动端的推送通知（APNs / FCM）要求有一个能发推送的服务端。是由 Relay 兼任，还是第一版只在 App 打开时提醒？
- 第一批接入哪些 Source：飞书、Telegram、GitHub，还是定时规则？
