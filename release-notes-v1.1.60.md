# v1.1.60 - Lock cleanup security fix

## English

v1.1.60 fixes a security issue in v1.1.59's TOTP lock paths. A logout, idle lock, cross-tab lock, or successful password/username change could leave a decrypted TOTP secret or generated code in hidden editor, list, or detail DOM nodes. A delayed logout request could also delay clearing in-memory state.

This release clears decrypted UI state immediately before awaiting logout, uses one lock path for credential changes, and invalidates any in-flight TOTP HMAC calculation so it cannot write into stale DOM after locking.

**Action required:** v1.1.59 is withdrawn. Upgrade directly to v1.1.60. Environments that already applied v1.1.59's `0007_totp_entries.sql` require no additional database migration. Cloudflare environments upgrading directly from v1.1.58 must apply `0007_totp_entries.sql` before deployment; Linux applies the equivalent migration idempotently at startup. No data rewrite or vault re-encryption is required.

## 中文

v1.1.60修复v1.1.59中TOTP锁库路径的安全问题。退出、空闲锁库、跨标签锁库或成功修改主密码/用户名时，隐藏的编辑器、列表或详情DOM可能残留已解密的TOTP密钥或验证码；服务端退出请求变慢时，内存清理也可能被延后。

本版本会在等待退出请求前立即清空已解密UI状态，修改凭据后统一走锁库路径，并使锁库前已启动的TOTP HMAC计算失效，避免其在锁库后写回旧DOM。

**必须升级：** v1.1.59已撤回，请直接升级到v1.1.60。已执行v1.1.59中`0007_totp_entries.sql`的环境无需额外数据库迁移；Cloudflare若从v1.1.58直接升级，必须在部署前执行`0007_totp_entries.sql`，Linux会在启动时幂等执行等效迁移。无需重写数据或重新加密密码库。