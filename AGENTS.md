# MyAid 开发约束

始终加载的工程护栏。领域与 DSH 真源在指针后的文档；改行为先读目标，勿在此复述。

写或改文档前读 [docs/AGENTS.md](docs/AGENTS.md)（分层、三件套、必有清单）。

## 何时读什么

- **产品行为 / 对象模型**：[BLUEPRINT](docs/BLUEPRINT.md)；Bot / 会话 / DSH 映射图见 [BOT_SESSION_MAP](docs/BOT_SESSION_MAP.md)；用词以 [GLOSSARY](GLOSSARY.md) 为准（见 [domain](docs/agents/domain.md)）。
- **DSH / Host / profile / 协议**：[DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md) 与 [ARCHITECTURE](docs/ARCHITECTURE.md)；能力面对照只读 [references/deepseek-harness](references/deepseek-harness)。
- **单元契约**（职责 / 命令）：各 [`apps/*/README`](apps/client/README.md)、[`packages/`](packages/README.md)、[`crates/`](crates/myaid-background-service/README.md)。
- **Client**：[apps/client/AGENTS.md](apps/client/AGENTS.md)（改 UI 前先 Design Guides，再 Coding Guides）。
- **Host**：[apps/host/AGENTS.md](apps/host/AGENTS.md)。
- **Relay**：[apps/relay/AGENTS.md](apps/relay/AGENTS.md)。
- **Plugin**（`myaid-plugin-*`）：[packages/AGENTS.md](packages/AGENTS.md)。
- **Issue / triage**：[issue-tracker](docs/agents/issue-tracker.md)、[triage-labels](docs/agents/triage-labels.md)。

## 边界

- DSH 集成以本仓 [DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md) 为准；执行能力复用官方 `dsh web`，不迁入其 Web GUI / 审批页 / DeepSeek 品牌文案（见 §7）。
- Client 保持官方 NSH **mixed** 布局；细则在 client AGENTS，不另起平行 `frontend/` 树。
- 线框任务才建线框目录；产品主路径不混入线框。
- `references/`（含 `nsh`、`deepseek-harness`）只读、不参与产品构建。

## 工程约定

- **Vite+（vp）**：JS/TS 工作区默认工具链为 `vp`（`vp run` / `vp check` / `vp pack` / `vp test` / `vp staged` / `vp fmt`）。根与包的 `package.json` scripts 都保留；根用 `vp run pkg#task` / `--filter` 调度。同一任务名不进 `vite.config.ts` → `run.tasks`（与 scripts 互斥，见 [run](https://viteplus.dev/guide/run)）。
- 轻量验收：`bun install && bun run check`（与 CI 同；`vp run check` 等价）。细节以根 `package.json` 为准。
- Git hooks：已有 `.vite-hooks/pre-commit` → `vp staged`；不绑全量 `check`。
- Client 应用生命周期走官方 `nsh run|check|build|test|package`；工作区编排仍用 `vp run @myaid/client#…`。勿在 `apps/client/scripts/` 加应用编排 TS；仓库根 `scripts/dev.mjs`（Host+Client 联调）例外。
- **dsh web 能力**：Session / 工具 / preset / Remote 优先复用官方 `dsh web` 与已装插件；产品缺口才新建 `myaid-plugin-*`。细则见 DSH_PRINCIPLES §4 与 [packages/AGENTS.md](packages/AGENTS.md)；Client UI 细则见 [apps/client/AGENTS.md](apps/client/AGENTS.md)。
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
