[中文](#中文) · [English](#english)

## 中文

### v1.1.13：共享邀请码注册门禁

- 新账户注册必须填写管理员配置的共享邀请码；服务端缺少配置时安全关闭注册，错误邀请码按来源持久限速。
- 既有账户登录不需要邀请码且保持兼容。Linux SQLite 与 Cloudflare D1/Worker 使用相同契约。
- 邀请码字段仅在注册模式可见，生产 smoke 脚本从 `INVITE_CODE` 环境变量读取并且绝不输出。
- 完整 95 项测试、lint、typecheck、build 与 npm audit 均通过。

### 升级与校验

升级前备份 Cloudflare D1/R2 或 Linux SQLite/附件目录。应用 D1 `0005_invite_attempts.sql`，并在两个运行环境安全配置 `INVITE_CODE`。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

> 安全提醒：邀请码是注册准入控制，不是身份验证因素，也不能替代强主密码。忘记主密码无法恢复库密钥。Cloudflare D1/R2 与服务器资源可能产生费用。

如果这个项目对你有帮助，欢迎在 GitHub 点 Star。

## English

### v1.1.13: shared-invitation registration gate

- New-account registration requires the administrator-configured shared invitation. Registration fails closed when configuration is absent, and wrong invitations are durably rate-limited by source.
- Existing-account sign-in needs no invitation and remains compatible. Linux SQLite and Cloudflare D1/Worker use the same contract.
- The invitation field is visible only in registration mode. Production smoke scripts read it from `INVITE_CODE` and never print it.
- All 95 tests, lint, typecheck, build, and npm audit pass.

### Upgrade and verification

Back up Cloudflare D1/R2 or Linux SQLite/attachment storage first. Apply D1 `0005_invite_attempts.sql`, and securely configure `INVITE_CODE` in both runtimes. Download the matching platform archive and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in the same directory.

> Security note: the invitation is admission control, not an authentication factor or replacement for a strong master password. A forgotten master password cannot recover the vault key. Cloudflare D1/R2 and server resources may incur charges.

If this project helps you, a GitHub Star is appreciated.
