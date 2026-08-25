# v1.1.68 — 批量设置分组 / Bulk group assignment

[中文](#中文) · [English](#english)

## 中文

### 新增

- “更多”菜单新增“批量设置分组”。
- 可在当前分类、当前分组与当前搜索结果范围内逐项选择或全选。
- 支持账号、网站、笔记、TOTP 与附件，目标可选“默认”或当前资料类型的自定义分组；“全部”仅是视图，不会写入资料。
- Cloudflare 与 Linux 运行时共用相同前端、密文格式和操作语义。

### 可靠性与移动端

- 批量写入中途失败会补偿已经成功的项目；补偿失败时重新加载服务端权威密文，选择状态保留以便重试。
- Chromium 与 WebKit 手机视口验证 44px 选择触控区、无横向溢出、刷新后持久化。

### 制品

- Cloudflare：`pass-vault-v2-cloudflare-1.1.68.tar.gz` / `.zip`
- Linux：`pass-vault-v2-linux-1.1.68.tar.gz` / `.zip`
- 完整性：下载 `SHA256SUMS` 后运行 `sha256sum -c SHA256SUMS`

## English

### Added

- Added **Bulk group assignment** to the More menu.
- Select individual records or all records in the current type, group view, and search result set.
- Supports accounts, websites, notes, TOTP records, and attachments. Targets are Default or a custom group for the current type; the virtual All view is never persisted.
- Cloudflare and Linux share the same frontend, encrypted record format, and operation semantics.

### Reliability and mobile

- A mid-batch failure compensates records already written. If compensation fails, the client reloads authoritative encrypted server state and preserves the selection for retry.
- Chromium and WebKit mobile checks cover 44px selection targets, no horizontal overflow, and persistence after reload.

### Assets

- Cloudflare: `pass-vault-v2-cloudflare-1.1.68.tar.gz` / `.zip`
- Linux: `pass-vault-v2-linux-1.1.68.tar.gz` / `.zip`
- Integrity: download `SHA256SUMS`, then run `sha256sum -c SHA256SUMS`
