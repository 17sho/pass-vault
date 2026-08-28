# PassVault v2.2.3-server.1

## 中文

这是 Linux/SQLite 服务器版 v2.2.3 的增量发行，不替换 Cloudflare `v2.2.3` 或既有 `v2.2.3-server`。本版补齐独立 Admin 控制台、文件生命周期保护及响应式管理界面，并包含部署和回归测试所需的完整源码。

### 新增与改进

- 新增与密码库用户完全隔离的 Admin 身份、登录会话和独立管理服务。
- 新增概览、用户、注册、运维、安全、审计和设置七个 Admin 页面。
- Admin 可在设置页修改自身密码；成功后撤销全部 Admin 会话，所有设备必须重新登录。
- 新增配额、封禁、会话撤销、用户删除/导出、邀请、维护修复及安全事件管理能力。
- 新增文件生命周期 fence、删除 outbox、启动协调和维护修复流程，降低附件或分享对象与 SQLite 状态不一致的风险。
- 管理界面采用移动优先布局；修改密码入口从窄屏页头迁至设置页，避免 iPhone Safari 中按钮逐字换行和页头异常增高。

### 安全与兼容性

- Admin 身份、Cookie、凭据和会话不复用密码库用户体系。
- Admin 密码使用持久化 scrypt verifier；原始密码不会进入日志、审计或 URL。
- 不修改 Cloudflare Worker、D1/R2 schema、Vault Key、KEK、主密码或加密协议。
- 归档不包含生产环境变量、数据库、附件、备份、日志、部署证据、Git 元数据或依赖目录。

### 发行资产

- `pass-vault-v2-linux-2.2.3.tar.gz`
- `pass-vault-v2-linux-2.2.3.zip`
- `SHA256SUMS`

---

## English

This is an incremental Linux/SQLite server release for v2.2.3. It does not replace the Cloudflare `v2.2.3` release or the existing `v2.2.3-server` release. It adds the independent Admin console, file-lifecycle safeguards, responsive administration UI, and the complete source needed for deployment and regression testing.

### Added and improved

- Added an Admin identity, login session, and management service fully isolated from vault users.
- Added seven Admin pages: Overview, Users, Registration, Operations, Security, Audit, and Settings.
- Administrators can change their own password from Settings; success revokes every Admin session and requires all devices to sign in again.
- Added quota, suspension, session revocation, user deletion/export, invitation, maintenance repair, and security-event management.
- Added file-lifecycle fences, a deletion outbox, startup reconciliation, and maintenance repair flows to reduce divergence between attachment/share objects and SQLite state.
- Improved the mobile-first Admin layout. The password action moved from the narrow header into Settings, preventing per-character wrapping and oversized headers on iPhone Safari.

### Security and compatibility

- Admin identity, cookies, credentials, and sessions are separate from the vault-user system.
- Admin passwords use a persistent scrypt verifier; plaintext passwords are not written to logs, audit records, or URLs.
- No changes were made to the Cloudflare Worker, D1/R2 schema, Vault Key, KEK, master-password, or encryption protocols.
- Archives exclude production environment files, databases, attachments, backups, logs, deployment evidence, Git metadata, and dependency directories.

### Release assets

- `pass-vault-v2-linux-2.2.3.tar.gz`
- `pass-vault-v2-linux-2.2.3.zip`
- `SHA256SUMS`