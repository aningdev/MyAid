# @myaid/myaid-plugin-core

MyAid 能力插件空壳。家族约定见 [packages/AGENTS.md](../AGENTS.md)；原则见 [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) §4。

本包尚未暴露业务 Remote。开发 / Host 用绝对路径 `--patch` 指向 `lib/index.js`。

```sh
vp run @myaid/myaid-plugin-core#build
vp run @myaid/myaid-plugin-core#test
vp run @myaid/myaid-plugin-core#check
```

Harness 机制结论见 [docs/research/HARNESS_PRINCIPLES.md](../../docs/research/HARNESS_PRINCIPLES.md)。
