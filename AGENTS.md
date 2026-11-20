# dsh-bot 开发约束

每次都会加载的工程约束。产品语言和架构写在下面指向的文档里，改行为之前先读对应文档，不要在这里重复。

写或改文档前先读 [docs/AGENTS.md](docs/AGENTS.md)。

## 何时读什么

- **用词**：[docs/GLOSSARY.md](docs/GLOSSARY.md)。命名、issue、测试名一律用里面的术语。
- **结构、依赖方向、seam、数据归属**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，以及它 Subjects 表里列出的专题文档。
- **为什么这样定**：[docs/decisions/](docs/decisions/)。和某条 decision 冲突时，先明确说出来，不要悄悄绕过。
- **当前目标与验收**：[docs/specs/](docs/specs/)。
- **单元契约**（职责、命令）：各 `apps/*/README` 和 `packages/*/README`。
- **子树约束**：[Client](apps/client/AGENTS.md)（改 UI 前先读 Design Guides，再读 Coding Guides）· [Host](apps/host/AGENTS.md) · [Relay](apps/relay/AGENTS.md) · [插件](packages/AGENTS.md)。
- **上游对照**：[references/](references/README.md) 只读，不参与构建。

## 边界

- dsh web 是唯一后端，产品能力只通过 `packages/*` 里的 dsh 插件扩展；不 fork、不改 dsh，也不迁入它的 Web GUI、审批页和 DeepSeek 品牌文案（[0001](docs/decisions/0001-dsh-web-is-the-only-backend.md)）。先复用官方插件和 Remote，只有产品缺口才写自己的插件。
- Client 是纯 TSX，保持 NSH 生成的目录结构，不另起 `frontend/` 树（[0007](docs/decisions/0007-the-client-is-pure-tsx.md)）。
- 产品状态归 dsh 和本仓插件；Client 只保存 Device 自己的偏好（[ARCHITECTURE · 数据归属](docs/ARCHITECTURE.md#数据归属)）。
- 线框只放在线框任务的目录里，不混进产品主路径。

## 工程约定

- **Vite+（vp）**：JS/TS 工作区统一用 `vp`（`vp run` / `vp check` / `vp pack` / `vp test` / `vp staged` / `vp fmt`）。根和各包都在 `package.json` 里保留 scripts；根用 `vp run pkg#task` / `--filter` 调度。同名任务不写进 `vite.config.ts` 的 `run.tasks`（两者互斥，见 [run](https://viteplus.dev/guide/run)）。
- 根的 `check` / `test` **按发现运行**：`vp run -F '@dsh-bot/*' -F '!@dsh-bot/workspace' <task>` 会跑所有带该脚本的包，新包不用改根。Cargo 步骤单独一段（`test` 在前，`check` 在后）。
- 轻量验收：`bun install && bun run check`（与 CI 相同，只检查不改文件）；`bun run fix` 修格式和可自动修的 lint；`bun run test` 跑 Cargo 测试和各包测试。
- 启动入口只有一个：`bun run dev [target]`（`ios` / `android` / `web` / `mobile` / `windows` / `linux` / `gpui` / `macos`，默认是桌面）。低层的 `dev*` 脚本留在 `apps/client`。
- 不带参数的 `bun run dev` 会读写**真实的 `~/.dsh-bot`**。Agent、脚本化验证和冒烟测试一律用 `bun run dev --isolated[=<name>]`（数据根 `~/.dsh-bot-dev/<name>`，端口 4873），绝不运行不带它的 `dev`。
- **dsh 版本**只写在三个地方：根 `package.json` 的 `workspaces.catalog`、`apps/host/supported-dsh.json`、`references/deepseek-harness` 的 `dsh-v<version>` tag。各包一律写 `"catalog:"`，由 `bun run check` 保证一致。升级只改这三处，再 `bun install`。
- **文档**由 `scripts/check-docs.mjs` 检查（也在 `bun run check` 里）：相对链接和 `#heading` 必须能解析，ARCHITECTURE 不超过 16 KiB，专题文档不超过 24 KiB，并且都列在 Subjects 表里。
- Git hook：`.vite-hooks/pre-commit` → `vp staged`，不绑全量 `check`。
- Client 的生命周期走官方 `nsh run|check|build|test|package`，工作区编排用 `vp run @dsh-bot/client#…`。不要在 `apps/client/scripts/` 里加编排用的 TS；根目录的 `scripts/dev.mjs` 例外。
- 工具链版本：bun 不钉版本（CI 的 `setup-bun` 取最新稳定版）；共享的 npm 版本用 `workspaces.catalog` 加 `"catalog:"`。
- 按领域和职责分目录；入口公开 Interface，实现保持私有。拆分时保证每份策略和状态只有**一个所有者**。
- JS：Bun workspace 加唯一的 `bun.lock`。Rust：Cargo workspace。

## Agent skills

### Issue tracker

Issues 在 GitHub Issues 的 `aningdev/dsh-bot`（用 `gh`）。见 `docs/agents/issue-tracker.md`。

### Triage labels

默认五个：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单一上下文：`docs/GLOSSARY.md` 加 `docs/decisions/`。见 `docs/agents/domain.md`。
