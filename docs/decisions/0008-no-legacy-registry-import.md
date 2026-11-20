# 0008 不导入旧 Registry

## Context

[0004](0004-the-registry-lives-in-a-dsh-plugin.md) 曾要求 `bots` 插件第一次启动时导入 Client 的 `registry/bots.json`。项目尚未发布，Owner 已决定清空所有旧数据重新开始：没有需要保留的 Registry，导入路径只会成为一段没人用得到的迁移代码和测试。

## Decision

`dsh-bots` 不读取、不导入也不备份任何旧 Registry。插件在自己的 Registry 文件不存在时，直接创建一份只含 Main Bot 的新 Registry；旧路径下的文件原样留在磁盘上，插件不看它。

## Why

没有已发布的数据就没有兼容负担。少一条迁移路径，就少一份需要在每次启动时验证、却永远走不到的逻辑。

## Rejected

- **保留一次性导入**：项目未发布，没有真实用户数据；保留它等于为假设的历史写代码。
- **导入但静默忽略旧格式**：仍然要求插件探测旧文件，和完全不读相比没有收益。
