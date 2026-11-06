# @myaid/myaid-plugin-core

[English](README.md) | 中文

MyAid 能力插件空壳（Cordis / 声明式 `dsh.bundle`）。家族约定见 [packages/AGENTS.md](../AGENTS.md)；原则见 [DSH_PRINCIPLES](../../docs/DSH_PRINCIPLES.md) §4。索引：[packages/README.zh.md](../README.zh.md)。

本包尚未暴露业务 Remote。开发 / Host 用绝对路径 `--patch` 指向 `lib/index.js`（或官方 `dsh plugin add`）。

## 命令

```sh
vp run @myaid/myaid-plugin-core#build
vp run @myaid/myaid-plugin-core#test
vp run @myaid/myaid-plugin-core#check
```

Harness 机制结论见 [docs/research/HARNESS_PRINCIPLES.md](../../docs/research/HARNESS_PRINCIPLES.md)。
