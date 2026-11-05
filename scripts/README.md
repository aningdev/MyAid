# scripts/

编排逻辑已收拢到根与包的 `package.json`（bun workspaces + 官方 `nsh` 命令）。

请用：

```sh
bun run check
bun run dev
bun run build
bun run test
bun run host:dev
```

仅在官方命令无法表达时（例如未来 macOS 打包流水线）再在此添加单个脚本，不预建空壳。
