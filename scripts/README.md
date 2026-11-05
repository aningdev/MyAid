# scripts/

编排在根与包的 `package.json` scripts；根脚本用 `vp run` 调度包脚本（见 [Run](https://viteplus.dev/guide/run)）。

请用：

```sh
bun run check
bun run dev
bun run build
bun run test
bun run host:dev
```

（`vp run <name>` 跑同名根 script。）仅在官方命令无法表达时（例如未来 macOS 打包流水线）再在此添加单个脚本，不预建空壳。
