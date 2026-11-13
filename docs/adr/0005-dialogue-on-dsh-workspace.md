---
status: accepted
supersedes: 0003 (Dialogue 名与归档部分)
---

# Dialogue 建在 dsh Workspace 上

## 决定

Dialogue 不再自己持有 `workspace path`、名字与归档位：它指向一个 **dsh Workspace**。

```
dsh Workspace : canonical path · title · 有序 sessionIds · pinned sessionIds · archived set
MyAid 注册表  : Bot（identity / template / preset / 偏好）
                Dialogue { id, botId, workspaceId }
                Claim    sessionId → dialogueId
```

- **一个 Dialogue = 某个 Bot 对某个 Workspace 的视角**。两个 Bot 看同一个目录 → **一个 Workspace、两个 Dialogue**，共享该 Workspace 的 Session 账本、置顶与归档集合；每个 Dialogue 只列认领到自己的 Session。
- **名字就是 Workspace 的 title**：重命名走 `workspace.rename`。title 跨 Bot 共享——同一目录上的两个 Bot 只有一个名字（改一次，两个 Dialogue 都变）。
- **新建 Session** 走官方 create-then-attach：`session.create({ workspaceId, agentPreset })`，Host 在建好后把 Session attach 进 Workspace；随后再写 Claim。Client 不再传 `cwd`。
- **归档 / 取消归档 / 置顶 / 取消置顶 / Session 顺序** 全部走 `workspace.*` Remote。运行中的 Session 归档会被 dsh 以 `workspace/session-active` 拒绝，details 列出是谁在跑；界面据此给出 **Stop and archive**（`stopActivity: true`，由 dsh 先停该 Session 的 turn / subagent / job / schedule，再写入归档）。
- **Dialogue 没有自己的 archived 位**。归档是 Session 级的：**Archive Dialogue** 把该 Dialogue 认领的每条 Session 都归档（运行中的先经 Stop and archive 停下），全部归档后它在 Navigator 里落进 Dialogues 分区的「已归档」组，而不是拿到一个注册表标记。
- **Remove Dialogue** 只删注册表里的 Dialogue 与它的认领，且只对没有任何 Session 的 Dialogue 开放；**从不删除 dsh 的 Workspace**（目录、其它 Dialogue 与 Session 都归 dsh）。
- **Favorites** = dsh 的 pinned Sessions（最近置顶在前）+ 客户端偏好里已有的非 Session 地址（Bot / Dialogue / Settings）。Session 的置顶不再写偏好。
- 注册表 **v5** 只存 `workspaceId`。v3 / v4 文件在**连上 Host 后**迁移一次：逐 Dialogue `workspace.create(path)`（同规范路径返回既有 Workspace），名字在 Workspace 还是默认 title 时搬到 title，`archived` claim → `archiveSession`，v4 Favorites 中的 Session 地址 → `pinSession`；全部步骤幂等，可重跑；写 v5 前把 v4 文件备份为 `bots.json.v4.bak`。没有 Host 时 v4 文件**只读**，界面给出迁移提示，不写任何东西。

## 考虑过的做法

- **注册表继续存 path，Workspace 只是影子**：两处真源，dsh 的 title / 顺序 / 置顶 / 归档要么丢弃、要么再实现一遍。
- **官方 `ClientWorkspaceModel`**：正确形态。它的纯 ESM 在 `lib/types/client/model.js`，但包的 `./client` 入口是浏览器 `__ModuleLoader__` 包装（`dsh-client-store` 本身已发布，为纯 ESM + zustand/immer）；官方 client model 计划在下一批一起装载，因此本批不直接 import，而是自己解码同样的 `workspace.follow` 帧（每代 baseline 开场、`updatedAt` 较新者胜），Remote 返回只作为调用结果、不写状态。下一批切换时删掉这份投影。
- **给 Dialogue 加 archived 位**：dsh 没有 Workspace 归档；为了产品手感造一个本地归档会与 Session 归档集合冲突（同一 Session 在两处被打标）。
- **保留 cwd 传参**：`session.create` 接受 `workspaceId` 或 `cwd`，两者互斥；继续传 cwd 会让 Workspace 账本漏掉新 Session。

## 后果

- **建 Dialogue 需要 Host**：Workspace 只能由 dsh 建。离线时先存 Bot，Dialogue 等 Host 回来再开——Bot 的默认工作区偏好仍记在注册表。
- **离线 / 无 Host 期间看不到 v5 的路径与名字**：Dialogue 行只显示 Bot 名，直到 `workspace.follow` 的 baseline 到达；不拿注册表造第二份 path。
- **Workspace title 在 rename 时要求唯一**（dsh 拒绝重名）：两个目录的最后一段相同，改名时要给不同名字；新建时不强制。
- 跨设备同步仍是缺口，但**名字 / 置顶 / 归档已不再只在本机**：它们在 dsh 的 Workspace 注册表里，跟着 dsh 的数据根走。Bot identity 仍是本机注册表数据（[ADR 0003](0003-bot-identity-is-local-registry-data.md) 中 identity 部分继续有效）。
- 迁移只在连上 Host 时发生；成功后文件即 v5，`bots.json.v4.bak` 留作回退。
- 迁移里的名字 / 归档 / 置顶是**逐项尽力**：dsh 拒绝的项（title 已被别的 Workspace 占用、旧 Session 已不存在）跳过并计数，Dialogue 仍拿到 `workspaceId`，不让一份旧数据卡住整次迁移。
