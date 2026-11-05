# MyAid 开发约束

空壳阶段仍须遵守 DSH 集成原则。修改产品行为前读 [BLUEPRINT](docs/BLUEPRINT.md) 与 [GLOSSARY](GLOSSARY.md)；修改工作区、profile、通信、宿主或打包前读 [ARCHITECTURE](docs/ARCHITECTURE.md) 与 [DSH_PRINCIPLES](docs/DSH_PRINCIPLES.md)。客户端见 [apps/client/AGENTS.md](apps/client/AGENTS.md)；宿主见 [apps/host/AGENTS.md](apps/host/AGENTS.md)。

## 原则来源与边界

- 原则与组件边界继承本机 `~/Code/dsh-bot`；**不**默认移植其对话工作台 / 审批 UI / DeepSeek 品牌文案。
- `apps/client` 保持官方 NSH **mixed** 布局（`nsh init --template mixed`），不要为「更像 dsh-bot」而恢复独立 `frontend/` 树。
- 勿新建产品线框目录或把线框混进主路径，除非任务明确是线框。
- 轻量验收：`bun install && bun run check`（`vp check --fix` → plugin `tsc --noEmit` → `nsh check` → `cargo check`）。CI 同此；`vp run check` 等价。
- 根与包的 `package.json` scripts 都要留；根用 `vp run pkg#task` / `--filter` 调度，勿用 `bun --cwd`。同一任务名勿再塞进 `vite.config.ts` → `run.tasks`（与 scripts 互斥，见 [run](https://viteplus.dev/guide/run)）。
- Git hooks：官方 Vite+（[commit-hooks](https://viteplus.dev/guide/commit-hooks)）。已有 `.vite-hooks/pre-commit` → `vp staged`；勿假定根 `prepare` 已挂 `vp config --hooks`。勿绑全量 `bun run check`，勿用 `simple-git-hooks`。
- `apps/client` 直接用官方 `nsh run|check|build|test`。勿再往 `scripts/` 加编排 TS。
- 工具链版本以仓库实有文件为准：目前仅 [`.bun-version`](.bun-version)；共享 npm 版在 `workspaces.catalog`，包内用 `"catalog:"`，勿另钉旧版或臆造未落地的 `engines` / `packageManager` / `.node-version`。

## 目录与模块

- 按领域与职责分目录；模块入口集中公开 Interface，内部实现私有。
- 拆分保持策略与状态的唯一所有者，不按行数机械切割。

## 组件与依赖（DSH）

- 全部助手共用未经修改的官方 `dsh web`、`web` profile 与隔离数据根 `~/.myaid`（`DSH_HOME`）；不按助手拆进程或自拼执行运行时。
- Client（NSH）负责界面、注册表、本地操作与产品策略；官方协议客户端直连 dsh。dsh 运行准备、启动、ready、监控与回收由 **Host 独占**。
- `apps/client` 的 Rust crate 仅补足 NSH 标准 API 缺口；常驻 `apps/host` 负责 App 后台身份与 dsh 生命周期。**不设 `ProductService`。**
- 能力优先复用 dsh 插件；缺口放 `packages/myaid-plugin-*`，经声明式 bundle / `--patch` 装配。插件包用 Vite+：`vp pack` 出 `lib/`、`vp test`（`vite-plus/test`）、`tsc --noEmit` 做 check；`tsconfig` 继承根 `tsconfig.base.json`。勿在插件内写 `bun` / `bun:test` / 裸 `node --test`。
- 多端只经 Host 内 Bridge 出站；Relay 在 `apps/relay`，只转发密文。
- Bun 管 JS workspace + 唯一 `bun.lock`；Rust 由 Cargo 管理。`references/` 只读，不参与产品构建。

## NSH 原生能力

实现客户端前查阅 `references/nsh/website`（elements / modules）与安装版 `.nsh/types/`。选型顺序：原生组件与标准模块 → 产品组合 → 已核实缺口的最小自定义。详见 [ARCHITECTURE](docs/ARCHITECTURE.md)。

客户端样式化基础层在 [`apps/client/components/ui`](apps/client/components/ui/)（NSH gallery `nsh-gallery-ui` 的外观 / 动画）；产品功能组合该层，勿在功能模块直连 `nsh/base`。细则见 [`apps/client/AGENTS.md`](apps/client/AGENTS.md)。

## 异步、协议与持久化

- 跨进程输入在接收端校验；Host 协议集中在 `apps/host/src/host_control/protocol.rs`。
- 连接换代后旧回调不得回写当前状态；结果未知先核对，不盲目重发。
- 同一对象的关键读写串行；区分不存在、损坏与 I/O 失败。

## 业务不变量（原则）

- 助手是桌面持有的独立对象，引用 profile，对应唯一持续对话；桌面写注册表。
- 模板初始化后固定模板 ID 与工作区；恢复失败保留指针并分类报错。
- 停止当前执行、撤回输入与停止后台分别处理；归档只阻新输入。
