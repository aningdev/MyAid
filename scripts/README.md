# scripts/

编排写在根和各包的 `package.json` scripts 里，根用 `vp run` 调度包脚本（见 [Run](https://viteplus.dev/guide/run)）。这里只放官方命令表达不了的脚本：

| 脚本                | 作用                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `dev.mjs`           | `bun run dev [target]` 的唯一入口                                                                   |
| `dsh-pin.mjs`       | dsh 版本的唯一读取点：catalog、`apps/host/supported-dsh.json`、`references/deepseek-harness` 的 tag |
| `check-dsh-pin.mjs` | 上面三处不一致时让 `bun run check` 失败                                                             |
| `check-docs.mjs`    | 文档的链接、`#heading`、体积上限和 Subjects 表（规则见 [docs/AGENTS.md](../docs/AGENTS.md)）        |
