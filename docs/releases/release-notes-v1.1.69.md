# v1.1.69 — 批量置顶与批量删除 / Bulk pinning and soft deletion

[中文](#中文) · [English](#english)

## 中文

### 新增

- 批量选择栏新增“置顶所选 / 取消置顶所选”和“删除所选”。
- 操作范围严格限定为当前资料类型、当前分组、当前搜索结果；附件还遵循当前附件分类筛选。
- 账号、网站、笔记、TOTP 和附件使用相同的目标状态写入语义。
- 批量删除统一移入回收站，30 天内可恢复，不提供绕过回收站的永久删除捷径。
- 删除笔记时，未被其他未删除笔记引用的附件会随父项进入回收站；共享附件保持可用。

### 一致性与验证

- 顺序加密写入，中途失败时逆序补偿已经成功的项目。
- 补偿失败后重新加载服务端权威密文；重载也失败时明确要求锁定后重新登录。
- 已覆盖 Chromium、WebKit、390px 手机视口、五类资料、附件关系、失败补偿及无横向溢出。
- Cloudflare 与 Linux 共享前端和密文契约，但两端生产数据仍彼此独立。

### 制品

- Cloudflare：`pass-vault-v2-cloudflare-1.1.69.tar.gz` / `.zip`
- Linux：`pass-vault-v2-linux-1.1.69.tar.gz` / `.zip`
- 完整性：下载 `SHA256SUMS` 后运行 `sha256sum -c SHA256SUMS`

## English

### Added

- The shared bulk-selection bar now provides **Pin selected / Unpin selected** and **Delete selected** actions.
- Scope remains limited to the current record type, group, and search result; attachments also respect the active attachment-category filter.
- Accounts, websites, notes, TOTP records, and attachments use the same target-state write semantics.
- Bulk deletion always moves records to Trash for 30-day recovery; it does not add a permanent-delete shortcut.
- When notes are deleted, attachments not referenced by another live note follow their parent into Trash, while shared attachments remain available.

### Consistency and verification

- Encrypted writes run sequentially and compensate completed writes in reverse order after a failure.
- If compensation fails, the client reloads authoritative ciphertext; if reload also fails, it explicitly asks the user to lock and sign in again.
- Coverage includes Chromium, WebKit, a 390px mobile viewport, all five record types, attachment relationships, failure compensation, and horizontal-overflow checks.
- Cloudflare and Linux share the frontend and encrypted contract, while production data remains independent.

### Assets

- Cloudflare: `pass-vault-v2-cloudflare-1.1.69.tar.gz` / `.zip`
- Linux: `pass-vault-v2-linux-1.1.69.tar.gz` / `.zip`
- Integrity: download `SHA256SUMS`, then run `sha256sum -c SHA256SUMS`
