# MyAid 开发约束

始终加载的工程护栏。领域与 DSH 真源在指针后的文档；改行为先读目标，勿在此复述。

写或改文档前读 [docs/AGENTS.md](docs/AGENTS.md)（分层、三件套、必有清单）。

## 何时读什么

- **产品行为 / 对象模型**：[BLUEPRINT](docs/BLUEPRINT.md)；Bot / 会话 / DSH 映射图见 [BOT_SESSION_MAP](docs/BOT_SESSION_MAP.md)；用词以 [GLOSSARY](GLOSSARY.md) 为准（见 [domain](docs/agents/domain.md)）。
- **DSH / Host / profile / 协议**：[DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md) 与 [ARCHITECTURE](docs/ARCHITECTURE.md)；能力面对照只读 [references/deepseek-harness](references/deepseek-harness)。
- **单元契约**（职责 / 命令）：各 [`apps/*/README`](apps/client/README.md)、[`packages/`](packages/README.md)、[`crates/`](crates/myaid-service/README.md)。
- **Client**：[apps/client/AGENTS.md](apps/client/AGENTS.md)（改 UI 前先 Design Guides，再 Coding Guides）。
- **Host**：[apps/host/AGENTS.md](apps/host/AGENTS.md)。
- **Relay**：[apps/relay/AGENTS.md](apps/relay/AGENTS.md)。
- **Plugin**（`packages/*` 里的 `dsh-*` 能力插件）：[packages/AGENTS.md](packages/AGENTS.md)。
- **Issue / triage**：[issue-tracker](docs/agents/issue-tracker.md)、[triage-labels](docs/agents/triage-labels.md)。

## 边界

- DSH 集成以本仓 [DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md) 为准；执行能力复用官方 `dsh web`，不迁入其 Web GUI / 审批页 / DeepSeek 品牌文案（见 §7）。
- Client 是纯 TSX（无 Rust crate，[ADR 0007](docs/adr/0007-native-layer-after-lorca.md)），保持 NSH 生成的目录形状；细则在 client AGENTS，不另起平行 `frontend/` 树。
- 线框任务才建线框目录；产品主路径不混入线框。
- `references/`（含 `nsh`、`deepseek-harness`）只读、不参与产品构建。

## 工程约定

- **Vite+（vp）**：JS/TS 工作区默认工具链为 `vp`（`vp run` / `vp check` / `vp pack` / `vp test` / `vp staged` / `vp fmt`）。根与包的 `package.json` scripts 都保留；根用 `vp run pkg#task` / `--filter` 调度。同一任务名不进 `vite.config.ts` → `run.tasks`（与 scripts 互斥，见 [run](https://viteplus.dev/guide/run)）。
- 根 `check` / `test` **按发现跑**，不写死包名：`vp run -F '@myaid/*' -F '!@myaid/workspace' <task>` 跑所有带该脚本的包（顺序按 workspace 依赖图）；新包只要有 `check` / `test` 脚本就自动纳进，不用改根。Cargo 步骤另起一段（`test` 在前、`check` 在后）。
- 轻量验收：`bun install && bun run check`（与 CI 同）；`bun run test` 跑 Cargo 测试与各包测试。细节以根 `package.json` 为准。
- 启动入口只有一个：`bun run dev [target]`（`ios` / `android` / `web` / `mobile` / `windows` / `linux` / `gpui` / `macos`，缺省桌面）。它先核对依赖与 Host 是否新鲜（必要时 `bun install` / 重建 `myaid-host`）；只有桌面目标才有 Host `PATH` 包装与 Bot preset 插件 overlay。低层 `dev*` 脚本留在 `apps/client`。
- 普通 `bun run dev` 用的是**真实的 `~/.myaid`**（注册表、偏好、Host、dsh 数据）。Agent、脚本化验证与冒烟一律用 `bun run dev --isolated[=<name>]`（数据根 `~/.myaid-dev/<name>`、端口 4873），绝不跑不带它的 `dev`。
- **dsh 版本真源**：根 `package.json` → `workspaces.catalog`（所有 `@deepseek-ai/*`）加 `apps/host/supported-dsh.json`（Host 编译进二进制）；包内一律写 `"catalog:"`，`bun run check` 校验两者一致。升级 dsh 只改这两处再 `bun install`。
- Git hooks：已有 `.vite-hooks/pre-commit` → `vp staged`；不绑全量 `check`。
- Client 应用生命周期走官方 `nsh run|check|build|test|package`；工作区编排仍用 `vp run @myaid/client#…`。勿在 `apps/client/scripts/` 加应用编排 TS；仓库根 `scripts/dev.mjs`（唯一 dev 入口）例外。
- **dsh web 能力**：Session / 工具 / preset / Remote 优先复用官方 `dsh web` 与已装插件；产品缺口才新建自己的插件。细则见 DSH_PRINCIPLES §4 与 [packages/AGENTS.md](packages/AGENTS.md)；Client UI 细则见 [apps/client/AGENTS.md](apps/client/AGENTS.md)。
- 工具链版本以仓库实有文件为准：仅 [`.bun-version`](.bun-version)；共享 npm 版用 `workspaces.catalog` + `"catalog:"`。
- 按领域与职责分目录；入口公开 Interface，实现私有。拆分保持策略与状态的**唯一所有者**。
- JS：Bun workspace + 唯一 `bun.lock`。Rust：Cargo。

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `aningdev/MyAid` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
