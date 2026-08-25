# Pass Vault V2 v1.1.17

## 中文

本版本新增安全修改登录用户名：在“更多”中打开独立弹窗，显示当前用户名，并要求输入新用户名及当前主密码。请求受认证、同源 CSRF、精确字段白名单和共享 Unicode 用户名规则保护。成功后会撤销该账户全部会话并清除 Cookie，需要使用新用户名和原主密码重新登录。

用户名变更不会修改主密码、KDF、包装后的 vault key 或任何条目/附件密文，因此不会重新加密密码库，原数据保持可解密。

## English

This release adds secure login-username changes from the More menu. The dedicated dialog shows the current username and requires a new username plus the current master password. The endpoint enforces authentication, same-origin CSRF, an exact body allowlist, and the shared Unicode username contract. Success revokes every account session, expires the cookie, and requires signing in with the new username and unchanged master password.

The operation does not modify the password, KDF, wrapped vault key, or any encrypted record/attachment, so it performs no vault re-encryption and existing data remains decryptable.

## Verification

Covered on Worker/D1 and Linux/SQLite backends, plus Chromium and WebKit at 320px and 390px. Release gates include the full test suite, lint, docs lint, typecheck, build, and dependency audit.
