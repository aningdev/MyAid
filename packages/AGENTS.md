# 插件规则

`packages/*` 里的插件跑在上游 dsh 上，所以规则也来自 dsh：每条一句话 + 出处。本仓的产品边界与缺口判断见 [DSH_PRINCIPLES](../docs/DSH_PRINCIPLES.md) §4、[ARCHITECTURE](../docs/ARCHITECTURE.md) §4；包索引见 [README](README.md)。写文档前读 [docs/AGENTS.md](../docs/AGENTS.md)。

出处只读：[`references/deepseek-harness`](../references/deepseek-harness) 下文简称 dsh。机制背景见 [HARNESS_PRINCIPLES](../docs/research/HARNESS_PRINCIPLES.md)。

## 命名

- 包名按职责取 `dsh-<名字>`，不加产品前缀；名字只在角色词表里挑（[角色词表](../references/deepseek-harness/docs/cookbook/adding-a-package.md#name-the-role-that-exists)）。
- 插件行 `id`、Remote 服务名、包自己的数据命名空间用同一个名字，改名一次改完（[同上](../references/deepseek-harness/docs/cookbook/adding-a-package.md#name-the-role-that-exists)）。

## `package.json`

- `type: "module"`，`main` / `exports["."]` 指向 `lib/`，`files` 只列运行期要用的东西（[bundle manifest](../references/deepseek-harness/docs/user/develop/basic/publish.md#the-bundle-manifest)）：dsh 只发 `lib/` 与类型声明、不发 `src`，本仓的 `./remote` 指向 `src/remote.ts` 交给 Client 打包器编译，所以 `files` 多一份 `src`。
- `dsh.bundle.patch` 指向同目录的 `cordis.patch.yml`（[同上](../references/deepseek-harness/docs/user/develop/basic/publish.md#the-bundle-manifest)）。
- `engines.dsh` 写成区间，且必须包含根 `workspaces.catalog` 的 dsh 版本；`bun run check` 校验（[同上](../references/deepseek-harness/docs/user/develop/basic/publish.md#the-bundle-manifest)）。
- 与 Host 共享实例的 dsh 包同时写进 `peerDependencies` 与 `devDependencies`，两边同一区间，值一律 `"catalog:"`（[清单不变量](../references/deepseek-harness/docs/cookbook/adding-a-package.md#1-create-the-package)）。
- 独立演进的第三方依赖放 `dependencies`；`@deepseek-ai/schemastery` 也在 `dependencies`，它是运行期校验器（[清单不变量](../references/deepseek-harness/docs/cookbook/adding-a-package.md#1-create-the-package)）。

## 布局

- `src/index.ts` 导出 `name`、`inject`、`apply`，可选导出 `Config`（[first plugin](../references/deepseek-harness/docs/user/develop/basic/index.md#what-is-a-plugin)、[config](../references/deepseek-harness/docs/user/develop/basic/config.md#define-the-config-type)）。
- `cordis.patch.yml` 与包同级；要展示元数据时加 `locale/en.json` + `locale/zh.json`（[display metadata](../references/deepseek-harness/docs/cookbook/adding-a-package.md#plugin-display-metadata)）。
- 包内相对导入写 `.ts` 后缀，跨包用包名（[conventions](../references/deepseek-harness/AGENTS.md#conventions)）。

## 代码

- 一切注册都是 effect：经 `ctx.effect()` / `ctx.on()`，注册函数返回 disposer（[conventions](../references/deepseek-harness/AGENTS.md#conventions)）。
- 部署可能想改的值进 `Config`，不写 `DEFAULT_*` 常量（[设计原则](../references/deepseek-harness/docs/user/develop/basic/config.md#design-principles)）。
- 自洽的约束写进 schema，配置不合法就在加载时报错，不静默跳过（[fail loud](../references/deepseek-harness/docs/user/develop/basic/config.md#fail-loudly-on-invalid-configuration)）。
- 跨边界的 id 带命名空间，不用裸 `string` 当身份（[conventions](../references/deepseek-harness/AGENTS.md#conventions)）。
- ESM；同一份代码在 dev（`tsx`/bundle）与安装后（Node 跑 `lib/`）都必须是 ESM（[conventions](../references/deepseek-harness/AGENTS.md#conventions)）。

## 构建产物

- `lib/` 不入库（dsh 的 [`.gitignore`](../references/deepseek-harness/.gitignore)）；`bun run dev` 在写 overlay 前构建它，其余入口按需 `vp run <包>#build`。
- 安装后的包要能被 Node 直接加载：`.` 入口指向 `lib/` 里的 JS，不是 TS 源码——Node 不会在 `node_modules` 下剥 TypeScript，源码入口装出来就加载不了（[publish](../references/deepseek-harness/docs/user/develop/basic/publish.md#installing-from-github-the-build-script-catch)）。

## 测试与检查

- 单测用 `vp test`，放 `src/*.test.ts`；不为通过改断言或删检查（[verify](../references/deepseek-harness/docs/cookbook/adding-a-package.md#6-verify)）。
- 格式、lint、类型走根 `bun run check`（`vp check`）；根 `check` / `test` 按发现跑，新包只要有脚本就自动纳入。

## 装配与消费

- 开发期与 Rust Host 用绝对路径 `--patch` overlay，`name` 指向构建产物的 `file://` URL；profile 装包走 `dsh plugin add`（[overlay](../references/deepseek-harness/docs/user/develop/basic/index.md#register-it-in-cordisyml)、[loading order](../references/deepseek-harness/docs/user/develop/basic/publish.md#the-loading-order)）。
- 插件以 `dsh.bundle` 声明的那层补丁就是它的装配面，不在代码里再写一份默认组合（[bundle manifest](../references/deepseek-harness/docs/user/develop/basic/publish.md#the-bundle-manifest)）。
- Client 只经插件导出的 `./remote`（Typert 面）调用，并在 [`apps/client/lib/dsh/sdk.ts`](../apps/client/lib/dsh/sdk.ts) 登记一次；插件**不**依赖 [`@myaid/dsh-web-protocol`](dsh-web-protocol/README.md)，DTO 在那里只是 Client 侧镜像。
- 产品缺口的判据在 [DSH_PRINCIPLES](../docs/DSH_PRINCIPLES.md) §4：先复用官方 `dsh web` 与已装插件，缺口才建插件。
