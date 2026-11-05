# Harness / Cordis 集成原则

从官方 DeepSeek Harness / Cordis 行为提炼的**机制原则**。完整证据对照只读 [`references/deepseek-harness`](../../references/deepseek-harness)；本文只保留可继承结论。

## 结论

- 每个助手可拥有稳定的运行时 preset 标识，经公开 Agent create/resume setup 装配配置。
- 配置变更：在空闲时释放旧 `AgentHandle`，用**同一 Session ID** 恢复新 Agent，保留历史且下一轮用新工具/指令/模型；**不必**重启整个 dsh。
- 不要求修改上游执行循环或持久化实现；所有会激活或修改助手的入口须由同一生命周期所有者协调。

## Preset 与插件

- 配置解析为上游 `PresetDefinition` 插件条目；注册/释放由 Cordis 插件 effect 管理。
- `AgentPresetRegistry.register` 接受配置并返回释放函数；重复标识拒绝。旧 Agent 保留旧版本绑定，不能只覆盖声明。
- 进程服务仍由 **profile** 装配；需要隔离的服务遵循上游 isolation group。

## 与官方 Session Controller 共存

- 官方控制器内部 create/resume 可能不向应用返回可销毁的 `AgentHandle`。
- 推荐产品插件从首次创建起持有句柄；历史跟随触发的冷恢复等间接入口也须纳入同一协调。
- 不能只串行化「保存按钮」，也不能在配置替换窗口暴露未协调的官方接口。

## MyAid 落地

- 产品插件目录：`packages/myaid-plugin-*`。
- 装配元数据：`cordis.patch.yml` + `dsh.bundle`。
- Host/开发期用绝对路径 `--patch` 指向 `lib/index.js`。
- 详见 [DSH_PRINCIPLES.md](../DSH_PRINCIPLES.md) §4 与 [ARCHITECTURE.md](../ARCHITECTURE.md) §4。
