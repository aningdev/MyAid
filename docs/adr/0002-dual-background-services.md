---
status: accepted
---

# 双 Background Service，薄 OS 适配

产品后台是 Client 上的单一能力，编排 **Host** 与 **Relay** 两个对等的 Background Service（各自独立进程与存活，向 OS 自登记）。跨平台保持统一产品契约与本机控制面形状（HostControl ∥ RelayControl）；OS 差异只落在 IPC、进程树、环境与服务登记等薄适配层。开发态可显式拉起而不登记；成品态必须登记。登记与控制面可先于 Relay 密文转发实现。

## 考虑过的做法

- 按平台拆 Host 接入策略或平行 `host-macos` / `host-windows`。会复制 Lifecycle/协议并永久漂移，否决。
- Host 父子托管 Relay（或单一监督巨进程代登记）。把故障域绑死，且与「Relay 只转发密文、授权在 Bridge」的边界冲突，否决为默认模型。
- 把 Relay 启停塞进 HostControl。破坏对等与解耦，否决。
- Windows 长期不做 OS 登记、另开产品故事。与「成品必登记双单元」冲突，否决。

## 后果

- 半启用合法：OS 只批准其一则产品后台降级可用，不整笔回滚，也不改成 Host 代管。
- 「停止后台」只编排两个 Background Service 的停止/注销意图，不删 Registry、不停单条会话、不清 Data root。
- 移动端不跑 Background Service；经 Relay 转发，不影响桌面登记状态。
- 首发优先 macOS 上双单元登记可验收；Windows 跟同一契约；Linux 延后且不绑架抽象。
- 术语见根 [GLOSSARY.md](../../GLOSSARY.md)（Background、Background Service、Host、Relay、Bridge、HostControl、RelayControl）。
