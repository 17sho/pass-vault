# v1.1.67 — 双运行时安全与生命周期修复 / Dual-runtime security and lifecycle fixes

[中文](#中文) · [English](#english)

## 中文

### 修复与安全

- Linux 备份恢复现在强制保留当前账户的 KDF 与包装密钥材料；完整备份替换会清理旧附件，采用临时文件、同步与原子切换，并对同一账户串行化导入。
- Linux 附件删除改为先提交数据库状态，再清理物理对象；即使进程或文件系统操作失败，也不会留下“数据库仍引用、文件已消失”的不可恢复状态。
- Linux 注册、密码登录及 Passkey 认证 POST 统一要求精确同源与 JSON Content-Type；会话记录准确区分密码、Passkey 和迁移前未知方式。
- 锁库同步清除主密码表单、编辑器密码/生成预览、附件预览 URL 和敏感引用，同时保留剪贴板安全比对计时直至完成。
- 备份导入/导出绑定当前保险库会话代际；迟到响应在锁库后不能下载、重开确认窗口或继续提交。旧明文迁移会先在本地完成全部加密与校验，再开始上传，避免部分导入。
- Linux systemd 模板增加 `UMask=0077`、设备/主目录/内核/控制组保护及重启退避。
- Cloudflare 包含 `main` 上已验证的 R2 生命周期修复（`0011`–`0013`）：持久补偿、in-flight fencing、并发完整导入锁和物理配额一致性。

### 制品

- Cloudflare：`pass-vault-v2-cloudflare-1.1.67.tar.gz` / `.zip`
- Linux：`pass-vault-v2-linux-1.1.67.tar.gz` / `.zip`
- 完整性：下载 `SHA256SUMS` 后运行 `sha256sum -c SHA256SUMS`

两个包都使用占位配置，不包含生产域名、资源 ID、凭据、数据库、附件、备份或部署记录。

### 升级

- Cloudflare：先备份 D1 + R2，依次应用全部未执行迁移（包括 `0011`–`0013`），再部署 Worker 与静态资源。
- Linux：停止服务后创建同点 SQLite + 附件备份，使用新的不可变版本目录原子切换，并在健康检查失败时回滚。
- 服务器辅助 Passkey 会改变纯客户端零知识边界。仅在理解该边界并安全配置独立 KEK、精确 RP ID 与 Origin 时启用；Linux 未配置 KEK 时该功能保持关闭。

### 验证

- 源码完整测试：**317/317**，fail 0，自然 exit 0。
- Lint、文档检查、TypeScript、Build、Node 语法及 `git diff --check` 通过。
- Linux 生产已验证健康、SQLite `integrity_check=ok`、外键违规 0、附件双向不一致 0；数据库保持全新空实例。

如果这个项目对你有帮助，欢迎点一个 Star。

## English

### Fixes and security

- Linux backup restore now always preserves the current account's KDF and wrapped-key material. Full replacement removes superseded attachments, uses temporary files with sync and atomic rename, and serializes imports per account.
- Linux attachment deletion commits database state before removing the physical object, preventing an unrecoverable database-reference-to-missing-file state after a crash or filesystem failure.
- Linux registration, password login, and Passkey authentication POST routes uniformly require an exact same-origin JSON request. Session metadata distinguishes password, Passkey, and pre-migration unknown authentication methods.
- Locking synchronously clears current-password forms, editor password/generated previews, attachment preview URLs, and sensitive references while allowing the clipboard safety comparison timer to complete.
- Backup import/export operations are fenced to the current vault generation. Late responses after lock cannot download, reopen confirmation, or continue submission. Legacy plaintext migration prepares and validates every encrypted item locally before the first upload, preventing partial import on local failure.
- The Linux systemd template adds `UMask=0077`, device/home/kernel/control-group protection, and restart backoff.
- The Cloudflare package includes the verified R2 lifecycle fixes from `main` (`0011`–`0013`): durable compensation, in-flight fencing, serialized full imports, and physical quota consistency.

### Assets

- Cloudflare: `pass-vault-v2-cloudflare-1.1.67.tar.gz` / `.zip`
- Linux: `pass-vault-v2-linux-1.1.67.tar.gz` / `.zip`
- Integrity: download `SHA256SUMS`, then run `sha256sum -c SHA256SUMS`

Both packages use placeholder configuration and exclude production domains, resource IDs, credentials, databases, attachments, backups, and deployment records.

### Upgrade

- Cloudflare: back up D1 + R2, apply every pending migration in order (including `0011`–`0013`), then deploy the Worker and static assets.
- Linux: stop the service, create a point-in-time SQLite + attachment backup, atomically switch to a new immutable release directory, and roll back if health checks fail.
- Server-assisted Passkey changes the client-only zero-knowledge boundary. Enable it only with an independent KEK and exact RP ID/Origin after understanding that boundary. It remains disabled on Linux when no KEK is configured.

### Verification

- Canonical source suite: **317/317**, fail 0, natural exit 0.
- Lint, documentation checks, TypeScript, build, Node syntax, and `git diff --check` passed.
- Linux production was verified healthy with SQLite `integrity_check=ok`, zero foreign-key violations, and zero missing/orphan attachment objects; it remains a fresh empty instance.

If this project is useful to you, a Star is appreciated.
