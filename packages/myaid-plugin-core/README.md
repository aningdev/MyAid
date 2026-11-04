# @myaid/myaid-plugin-core

MyAid 能力插件空壳。对位 dsh-bot 的 `packages/dsh-plugin-*`，落实 [DSH 插件原则](../../docs/DSH_PRINCIPLES.md)：

- 经 `cordis.patch.yml` + `package.json` → `dsh.bundle` 声明式装配进官方 `web` profile
- 能力规则与专属数据归插件；NSH 只调公开 Remote（本包尚未暴露业务 Remote）
- 开发 / Host 使用绝对路径 `--patch` 指向 `lib/index.js`

```sh
bun run build
bun test
```

Harness 机制结论见 [docs/research/HARNESS_PRINCIPLES.md](../../docs/research/HARNESS_PRINCIPLES.md)。
