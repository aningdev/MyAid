# DSH Profiles 对照（web / desktop / headless / sdk / acp）

从上游 DeepSeek Harness 官方文档与源码提炼的 **Profile 差异**，以及对 MyAid 的适用结论。完整证据在只读 [`references/deepseek-harness`](../../references/deepseek-harness)；本文只保留可核对结论。产品约束见 [DSH_PRINCIPLES](../DSH_PRINCIPLES.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[BOT_SESSION_MAP](../BOT_SESSION_MAP.md)。

## 一句话结论

**MyAid 应继续以官方 `web` profile（`dsh web`）为唯一执行后台**：它是随附、可由 CLI 启动的 HTTP/WebSocket 应用面，提供 Session / Remote / Connection 认证与 preset 装配；与 Host 启停 + NSH 直连官方协议的架构一致。`desktop` 不是同级 CLI 模板，而是 Electron 独占的保留 profile；`headless` / `sdk` / `acp` 面向一次性任务或 stdio 协议客户端，不能替代产品 Client 所需的 Web Host 传输。

## 各 Profile 对照表

上游对「随附 profile」的权威枚举是 **`web`、`headless`、`sdk`、`sdk-minimal`、`acp`**（见 [`docs/architecture.md` §Application launch](../../references/deepseek-harness/docs/architecture.md)、[`PROFILE_TEMPLATES`](../../references/deepseek-harness/packages/util/official-bundles/src/bundles.ts)）。**`desktop` 不在该模板表中**，但作为保留名与 Electron 壳同名出现；下表按研究问题五名对照，并注明 `sdk-minimal`。

| | **web** | **desktop** | **headless** | **sdk** | **acp** |
|---|---|---|---|---|
| **目的 / 宿主面** | 浏览器 GUI：聊天、模型/设置、Session 历史（[`dsh-web-app` Summary](../../references/deepseek-harness/packages/bundle/web-app/README.md)） | Electron 原生壳包住**完整 Web 应用**；独占 `$DSH_HOME/profiles/desktop`（[`architecture.md` §Desktop](../../references/deepseek-harness/docs/architecture.md)、[`apps/desktop/README.md`](../../references/deepseek-harness/apps/desktop/README.md)） | 命令行一次性任务：跑完打印答案并退出，无 GUI/无服务器（[`dsh-headless` Summary](../../references/deepseek-harness/packages/bundle/headless/README.zh.md)） | 进程外 SDK 客户端经 **JSON-RPC stdio** 驱动 Agent（[`dsh-sdk-app`](../../references/deepseek-harness/packages/bundle/sdk-app/README.md)、[`dsh-sdk-jsonrpc-server`](../../references/deepseek-harness/packages/sdk/server/README.md)） | 自动化-only **ACP** stdio：程序创建/恢复/关闭持久 Session（[`dsh-acp-app`](../../references/deepseek-harness/packages/bundle/acp-app/README.md)、[`dsh-acp`](../../references/deepseek-harness/packages/acp/acp/README.md)） |
| **入口 / CLI** | `dsh web` 或 `dsh --profile web`（[`apps/cli/README.md` Entry modes](../../references/deepseek-harness/apps/cli/README.md)） | **CLI 不能 boot** 该 profile；由 Electron Desktop Host 经共享 profile runner 启动；`dsh plugin --profile desktop` 仅 Desktop 安装的命令可管已初始化目录（同 CLI README；[`desktop/README.md` Installation ownership](../../references/deepseek-harness/apps/desktop/README.md)） | `dsh --profile headless "task"` / `dsh headless`（CLI README；headless README） | `dsh --profile sdk`（CLI README；TS/Python SDK 默认选此） | `dsh --profile acp`（CLI README；acp README） |
| **Transport / UI** | HTTP(S) 监听 + 启动 token / 签名 Cookie；API 与 WebSocket 流；默认可开浏览器（web-app README §Starting / §Listening） | 同 Web 的 RPC/流；Electron 把本机页接到已认证 Host；默认 OS 分配端口；`dsh-app://` 加载打包前端（architecture §Desktop；desktop README §Application overview） | **无监听端口**；stdout 最终答案或 `--json` 行事件；stderr 诊断/推理（headless README） | **stdout 仅 NDJSON JSON-RPC**；无 Web 服务器、无图形客户端（sdk-app Limitations） | **stdout 仅 ACP JSON-RPC**；无 DSH 专用展示/交互 UI（acp README §When to choose it） |
| **Bundle 装配** | `PROFILE_TEMPLATES.web` → `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`（[`bundles.ts`](../../references/deepseek-harness/packages/util/official-bundles/src/bundles.ts) L14–16） | 测试/运行时准备含 `dsh-base` + `dsh-web-app`（例：[`runtime-fixture.ts`](../../references/deepseek-harness/apps/desktop/tests/runtime-fixture.ts)）；**非** `PROFILE_TEMPLATES` 键；app-boot 用 `loadProfileDirectory` 加载已初始化目录且不经 CLI profile 查找（[`app-boot` §Profiles](../../references/deepseek-harness/packages/boot/app-boot/README.md)） | `base` + `@deepseek-ai/dsh-headless`（bundles.ts L17–19） | `base` + `@deepseek-ai/dsh-sdk-app`（bundles.ts L20–22） | `base` + `@deepseek-ai/dsh-acp-app`（bundles.ts L11–13） |
| **插件 / 服务差异（有源）** | web-app patch：webserver / web-runtime / connection、浏览器 `dsh.client` roster、preset 注册；默认 **live HMR**（app-boot：shipped `web` 用 live reload，其余随附模板启动时打 patch）（web-app README §Patch；app-boot §Profiles） | 同 web-app 层上，部分行仅当 `profileContext.name === 'desktop'` 启用（例：`desktop-product-telemetry` / `product-analytics`，[`web-app/cordis.patch.yml`](../../references/deepseek-harness/packages/bundle/web-app/cordis.patch.yml) L37–54）；与 npm CLI **不共享**可执行包/锁文件/`node_modules`（desktop README 状态归属表） | 挂 `headless-startup` + `headless-runner`；禁用共享 HMR 行；**默认禁用**托管 credentials / authorization / deepseek-account（headless README §凭据） | 挂 sdk startup + `dsh-sdk-jsonrpc-server`；禁用 HMR；含原生桌面工具与 `plugin_manager` 等（sdk-app README）；无图形客户端 | 挂 acp startup + `dsh-acp`；禁用 HMR；不增加私有 ACP 方法（acp-app README） |
| **Session / 执行模型** | 多轮浏览器 Session；每会话选 preset（默认 `standard`）；设置写入 `$DSH_HOME/profiles/web/cordis.patch.yml`（web-app §Per-session agent setup） | 与 Web 相同的完整应用与 Session 面；关窗可隐藏，Host 继续跑（desktop README §Closing） | **每次调用一个任务**后退出；默认可新 `session-<uuid>`，`--session-id` 沿用（有 cwd/preset/存活 Agent 等拒绝条件）（headless README） | 每 `sessionId` 开会话；stdin EOF / `shutdown` / 信号结束；配置变更需重启进程（sdk-app） | ACP `session/new|list|resume|close|prompt|…`；可跨进程恢复持久 Session（acp README §Protocol contract） |
| **显著约束** | 需已构建 frontend dist；`--host` 禁止通配；公开部署要 token/Cookie 与信任主机（web-app Limitations） | **保留名**：CLI 拒绝 boot/dump；npm 装的 `dsh` 不能改其插件；须先由 Desktop 初始化（CLI README；desktop README） | 无交互后续；须经 `dsh` 启动器（需进程退出能力）；默认不用 GUI 已存密钥（headless Limitations / §凭据） | stdout 纯度；无内建审批 UI 时部分工具需客户端审批响应（sdk-app） | 刻意省略 DSH 展示卡、计划、标题、终端视图等（acp README） |

**相关但不在提问五名内：`sdk-minimal`** — `PROFILE_TEMPLATES` 成员；**单独** `@deepseek-ai/dsh-sdk-minimal`，**不含** `dsh-base` / Web；工具面刻意极小（shell + `read_image` + `working_directory` 等）（[`sdk-minimal` README](../../references/deepseek-harness/packages/bundle/sdk-minimal/README.md)；bundles.ts L23–25）。

### 区分缝（文档事实，非推测）

1. **随附 CLI 模板 vs Electron 保留目录**
   - 事实：`PROFILE_TEMPLATES` 与 architecture「shipped profiles」列表均无 `desktop`（bundles.ts；architecture.md）。
   - 事实：CLI 明确 `desktop` 保留给 Electron，拒绝 boot（apps/cli/README.md）。
   - 事实：Desktop「调用共享 CLI profile runner 与完整 Web 应用」（architecture.md）。
   - **推断（标明）**：产品语义上 desktop ≈「web-app 组合 + Electron 载体 + 独占 profile 目录」，不是第五个与 web 平行的「另一套执行引擎」模板。

2. **web vs headless / sdk / acp**
   - 共享缝：后三者与 web 一样可建在 `dsh-base` 上（sdk-minimal 除外）（bundle/README.md；base README）。
   - 区分缝：**应用模式包**不同 → GUI+HTTP（web-app）vs 一次性 runner（headless）vs JSON-RPC 服务（sdk-app）vs ACP 桥（acp-app）（bundle/README 表）。

3. **sdk vs acp**
   - 同为 stdio、无 Web 服务器、startup-only patches。
   - 区分缝：协议与客户端生态不同——DSH SDK JSON-RPC（sdk-jsonrpc-server）vs 标准 ACP v1（dsh-acp / agentclientprotocol.com）（各自 README）。

## 能力差异（有源则写，无源则标明未知）

| 能力                  | 有源结论                                                                                                                                                                                                                                                                                                                                                                                                | 未知 / 需另查                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **工具面**            | base-backed 表面共享「完整工具集」叙事（file/shell/web/subagent/…）（base README §What you get）。web-app 将 agent 工具平面挪到 **preset** 后（web-app §Patch semantics）。headless 继承 base + runner。sdk 含原生桌面工具等；与 Desktop 工具对照有专用 expected 测试（sdk-app Dev Note → `desktop-tools.expected.e2e.ts`）。sdk-minimal **刻意省略**多数产品服务与文本文件工具（sdk-minimal README）。 | 未在本文展开逐工具矩阵；精确名单以各 profile `--dump-config` / composition 图为准（architecture 建议 `dsh --profile web --dump-config`）。            |
| **Remote / HTTP API** | web（及 Desktop 承载的 Web Host）提供 webserver、connection、浏览器插件图；required 启动集含 `webserver`、`web-runtime`、`modules`、`connection`（app-boot §Starting）。MyAid 连 `/api/remote.mux` 依赖该面（[DSH_CLIENT_AUTH](../DSH_CLIENT_AUTH.md)）。                                                                                                                                               | headless/sdk/acp 是否挂载任何 HTTP Remote：**文档未宣称**；headless 明确「不打开任何端口」；sdk/acp 明确无 Web server——**推断**无 MyAid 所用 mux 面。 |
| **Presets**           | web-app 挂 preset 注册与 shipped presets（`standard` / `ptc` / `minimal` / `cordis`）（web-app README）。MyAid 产品层：Bot 差异落在 preset，不落在 profile（[BOT_SESSION_MAP](../BOT_SESSION_MAP.md)）。                                                                                                                                                                                                | headless/sdk/acp 上 preset 编排细节未在本文逐行核对 patch；headless 沿用时会拒绝「本 profile 不组合的 agent preset」（headless §选择 Session 标识）。 |
| **Auth / 凭据**       | web/sdk/acp：**保留**「已保存凭据优先于环境」默认（headless README 对照句）。headless **默认关闭**托管凭据存储及依赖方。Web Connection：启动 token + 签名 Cookie（web-app）。ACP：`authenticate` 立即成功、无认证要求（acp README 协议表）。                                                                                                                                                            | Desktop 账户/Platform 登录流细节见 desktop README（与 MyAid NSH 产品登录非同一套壳）。                                                                |
| **GUI 所有权**        | 官方 harness：**Web GUI 属于 web-app / Desktop 壳**。MyAid：**有意不迁入**该 GUI，NSH 自建 UI，只复用协议与执行（[DSH_PRINCIPLES §7](../DSH_PRINCIPLES.md)）。                                                                                                                                                                                                                                          | —                                                                                                                                                     |
| **HMR**               | 仅 shipped `web` 模板默认 live reload；其他随附模板 startup-only（app-boot §Profiles）。                                                                                                                                                                                                                                                                                                                | desktop 目录内是否启用 HMR：未在本次主源摘录中单独核对。                                                                                              |
| **Isolation**         | Web 有 default-product / Client graph isolation 测试（`web-default-isolation.expected.e2e.ts`）。OPTIONAL / ON_DEMAND bundles 与 template 选择分离（official-bundles README）。                                                                                                                                                                                                                         | 「isolation group」业务语义若指 Cordis 服务隔离组，需另读 HARNESS_PRINCIPLES / 上游 notes；本文未展开。                                               |

## 与 MyAid 架构的匹配度

MyAid 已定形状（原则层）：

- 唯一官方执行后台：`dsh web` + 上游 `web` profile；`DSH_HOME=~/.myaid`（[DSH_PRINCIPLES §1](../DSH_PRINCIPLES.md)；[ARCHITECTURE §1–3](../ARCHITECTURE.md)）。
- Host 独占生命周期；当前实现：`["web", "--host", "127.0.0.1", "--port", "0", "--no-open"]`（[`guardian.rs`](../../apps/host/src/dsh_process/guardian.rs) L63–64），ready 解析 `dsh web: ` 行（[`lifecycle.rs`](../../apps/host/src/dsh_process/lifecycle.rs)）。
- Client（NSH）认证后 HTTP/WS 直连 dsh；不迁入 harness Web GUI（DSH_PRINCIPLES §5、§7；client AGENTS）。
- 全体 Bot **共用一个** web profile；差异在 **Agent preset**（BOT_SESSION_MAP）；插件经 patch/bundle 装进该 profile（packages/AGENTS.md）。

| Profile           | 匹配度           | 说明                                                                                                                                                                                      |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **web（主推荐）** | **匹配**         | 长驻进程、HTTP/WS Host、Session/Remote、preset、插件装配与产品文档一致；Host 已实现该入口。                                                                                               |
| **desktop**       | **不匹配主路径** | 绑定官方 Electron 壳与保留 profile；CLI 不可启；与 NSH Client + 自有 Rust Host 重叠且冲突。                                                                                               |
| **headless**      | **次要可能**     | 适合 CI/脚本/一次性任务；**不能**作产品对话后台（无端口、单任务退出）。                                                                                                                   |
| **sdk**           | **次要可能**     | 适合嵌入式/SDK 集成或自动化驱动同一 `DSH_HOME`；**不能**向 NSH 提供 remote.mux；与 web **不可**在同一进程兼任（Python 指南：web 与 SDK 为独立应用，见 `docs/user/guide/python-sdk.md`）。 |
| **acp**           | **次要可能**     | 适合标准 ACP 自动化/外部 IDE 协议；同样无 Web Host；且省略产品所需的 DSH 交互面。                                                                                                         |
| **sdk-minimal**   | **一般不采用**   | 缺 base 产品服务；与「复用官方完整执行能力」方向相反。                                                                                                                                    |

**主路径：`web`。** 其他 profile 仅在明确二级场景出现（脚本批跑、对外 ACP、独立 SDK 进程），且须**另进程 / 另 `DSH_HOME` 或明确隔离**，避免与唯一后台争用——产品原则已禁止按 Bot 拆 profile/进程（DSH_PRINCIPLES §1；BOT_SESSION_MAP）。

## 风险 / 误用

1. **把产品 NSH UI 当成「必须用 desktop profile」** — desktop 是上游 Electron 产品壳，不是「桌面端通用 profile」；MyAid 桌面壳是 NSH，执行面仍是 `dsh web`。
2. **把官方 `dsh web` GUI 迁进 MyAid** — 违反 DSH_PRINCIPLES §7；应复用协议与能力，自建产品 UI。
3. **按 Bot 拆 profile 或第二套 dsh 进程** — 违反单一后台与 BOT_SESSION_MAP；Bot 差异用 preset / 派生组合。
4. **用 headless/sdk/acp 替代 Host 后台** — 无（或非）MyAid 依赖的 Web Connection；Client 认证与 Session Remote 无法按现架构工作。
5. **混淆 profile 名 `desktop` 与 PROFILE_TEMPLATES** — 名称像第五模板，实为保留目录；对未初始化 desktop 跑普通 `dsh plugin` 会被拒绝或与 CLI 行为不一致（CLI / desktop README）。
6. **在 sdk/acp 上依赖 stdout 日志或随意 patch** — 破坏 JSON-RPC 帧（sdk-app / acp-app Limitations）。
7. **headless 期望使用 Web Models 页已存密钥** — 默认关闭托管凭据；需环境变量或显式 patch 恢复（headless §凭据）。

## Sources

### 上游（`references/deepseek-harness`）

- `docs/architecture.md` — shipped profiles；Desktop 段；`dsh --profile web --dump-config`
- `packages/util/official-bundles/src/bundles.ts` — `PROFILE_TEMPLATES`（web / headless / sdk / sdk-minimal / acp）
- `packages/util/official-bundles/README.md` — 模板语义
- `packages/bundle/README.md` — base / web-app / headless / sdk-app / acp-app / sdk-minimal 角色表
- `packages/bundle/base/README.md` — base-backed 共享核心
- `packages/bundle/web-app/README.md` + `cordis.patch.yml` — Web GUI、监听、preset、desktop-only 行
- `packages/bundle/headless/README.zh.md` — 一次性任务、凭据、json 流
- `packages/bundle/sdk-app/README.md` — SDK stdio 应用
- `packages/bundle/sdk-minimal/README.md` — 独立极简树
- `packages/bundle/acp-app/README.md` — ACP 应用层
- `packages/sdk/server/README.md` — JSON-RPC stdio 服务器
- `packages/acp/acp/README.md` — ACP 协议面
- `packages/boot/app-boot/README.md` — profile 加载、HMR、required ids、desktop `loadProfileDirectory`
- `apps/cli/README.md` — 入口模式；desktop 保留名
- `apps/desktop/README.md` — Electron 壳、独占 `profiles/desktop`、与 CLI 隔离
- `docs/user/guide/python-sdk.md` — sdk vs web 分应用

### MyAid 产品

- `docs/DSH_PRINCIPLES.md`、`docs/ARCHITECTURE.md`、`docs/BLUEPRINT.md`、`docs/BOT_SESSION_MAP.md`
- `docs/DSH_CLIENT_AUTH.md`、`AGENTS.md`、`packages/AGENTS.md`、`apps/client/AGENTS.md`、`apps/host/AGENTS.md`
- `apps/host/src/dsh_process/guardian.rs`、`lifecycle.rs` — 当前 `dsh web` 启动与 ready 行
- `docs/research/HARNESS_PRINCIPLES.md` — preset / 共享 profile 机制摘录
