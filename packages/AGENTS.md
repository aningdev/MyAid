# MyAid 插件约束

补充[根约束](../AGENTS.md)。适用于 `packages/myaid-plugin-*`。包索引见 [README.md](README.md)。写文档前读 [docs/AGENTS.md](../docs/AGENTS.md)。读 [DSH_PRINCIPLES](../docs/DSH_PRINCIPLES.md) §4、[ARCHITECTURE](../docs/ARCHITECTURE.md) §4；机制背景见 [HARNESS_PRINCIPLES](../docs/research/HARNESS_PRINCIPLES.md)。

## 职责

- 能力**优先复用**官方 `dsh web` / 已安装的 dsh 插件；实现前对照只读 [`references/deepseek-harness`](../references/deepseek-harness) 的插件、preset 与 Remote 形态；产品缺口才新建 `myaid-plugin-*`。
- 能力规则、专属数据与执行注入归插件；NSH 只经公开 Remote / 接口做管理与产品交互。
- 经 `cordis.patch.yml` + `package.json` → `dsh.bundle` 声明式装配进官方 `web` profile。
- 开发 / Host 用绝对路径 `--patch` 指向打包产物 `lib/index.js`（或官方 `dsh plugin add`）。
- 共享 profile 的全局插件开关不伪装成「每助手差异」；派生组合真源在插件侧。
- **禁止**依赖 [`@myaid/dsh-web-protocol`](dsh-web-protocol)（该包仅给 NSH Client 用）。插件按官方 Cordis / Host 推荐方式直依 `@deepseek-ai/dsh-*`（如 `dsh-agent`、`dsh-tools`、`dsh-session`、自建 `@Remote`）。

## 工具链（vp）

- 默认工具链为 Vite+：`vp pack` → `lib/`，`vp test`（`vite-plus/test`），`tsc --noEmit` 做 check；根调度 `vp run @myaid/<pkg>#build|test|check`。
- `tsconfig` 继承根 [`tsconfig.base.json`](../tsconfig.base.json)；共享依赖用 `"catalog:"`。
- 插件测试入口用 `vp test`，不用 `bun:test` / 裸 `node --test`。

## 包布局

- 源码在 `src/`；声明式补丁 `cordis.patch.yml` 与包同级。
- 入口集中公开 Interface（Cordis apply / Remote）；内部实现私有。
- 新插件包复制现有 `myaid-plugin-core` 的 scripts / `dsh.bundle` 形态，保持命名 `myaid-plugin-*`。
