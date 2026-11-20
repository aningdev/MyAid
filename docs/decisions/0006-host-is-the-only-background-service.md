# 0006 Host 是唯一的 Background Service

## Context

原来 Runner 上登记了两个 Background Service：Host 和本机 Relay。另外有一个 `crates/myaid-service`，专门给这两个单元生成 OS 登记计划。按 0003，Relay 改成了公网服务，Runner 上只需要 Bridge。

## Decision

- Runner 上只有 Host 一个 Background Service，Bridge 是 Host 的一部分。
- `apps/relay` 是独立部署的公网服务，不在任何 Device 上做 OS 登记。
- OS 登记代码并入 `apps/host`，删除 `crates/myaid-service`。

## Why

只有一个使用方的共享 crate 是一层多余的抽象。少一个常驻进程，也就少了一种部分失效的情况。

## Rejected

- **把 Relay 留在 Runner 上，再加一个公网 Relay**：Runner 上的那个没有任何作用。
