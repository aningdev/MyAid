---
status: accepted
---

# 客户端文件系统只授应用自己的数据

## 决定

Client 的 `nsh.json` 把 `capabilities.fs.read` 与 `fs.write` 都收窄到 `${homeDir}/.myaid`（注册表与客户端偏好）。附件不靠全盘读权限：回形针走系统文件选择器直接拿字节；拖放与「Finder 复制再粘贴」只给 `file:` URL，能读则读，授权外或超出读取上限就由 `features/dialogue/chat/attach.ts` 对同一个文件打开 `Picker`，让人点一下。

## 考虑过的做法

- **`fs.read: ["/"]` 或 `${homeDir}`**：拖放即读最顺手，但把整个 home（含凭据、邮件、其他项目）暴露给 UI 进程；Windows 上盘符路径也不在 `/` 下。
- **等「用户选中才可读」的授权**：nsh 0.6 的 `capabilities.fs` 仍只有根列表，没有按手势 / 文件粒度的授权；开过或拖入的文件不会自动获得读取权。等上游能力落地再放宽，不先假装有。
- **把附件字节塞进注册表或偏好**：产品数据目录会变成附件仓库，且与 dsh 的 attachment 面重复。

## 后果

- 注册表与偏好的读写仍在本机、无需弹窗；产品数据之外一律 `ERR_ACCESS_DENIED`，可用 `screens/fs-grant.test.tsx` 验证真实授权。
- 授权外的拖放 / 粘贴多一次选择器点击；手势与文件都不丢，也不要求全盘读权限。
- 附件上传仍走官方 `fileUploads` / `session.attachment`；Client 只负责把字节交给它们。
- 若未来 nsh 提供用户选中授权，可把 `attach.ts` 的回落收窄；届时先改本 ADR，再放宽 `nsh.json`。
