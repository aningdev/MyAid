# scripts/

编排在根 [`vite.config.ts`](../vite.config.ts) 的 `run.tasks`（见 [Run Config](https://viteplus.dev/config/run)）；包内脚本留在各自 `package.json`。

请用：

```sh
vp run check
vp run dev
vp run build
vp run test
vp run host:dev
```

（`vpr` 等同于 `vp run`。）仅在官方命令无法表达时（例如未来 macOS 打包流水线）再在此添加单个脚本，不预建空壳。
