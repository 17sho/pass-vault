# Security Policy / 安全政策

## Supported versions / 支持版本

安全修复只保证进入最新稳定 Release。报告前请先在最新版本复现；旧版本通常应直接升级。

| Version | Supported |
|---|---|
| Latest stable release | ✅ |
| Older releases and untagged snapshots | ❌ |

## Reporting a vulnerability / 报告漏洞

请勿通过公开 Issue、Discussion、PR、日志或截图披露漏洞、真实数据、密钥、数据库或可利用细节。请使用 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault/security/advisories/new) 提交私密漏洞报告；该仓库已启用此入口。不要把利用细节发送到公开渠道。

Do not disclose vulnerabilities, real data, secrets, databases, or exploit details in public issues, discussions, pull requests, logs, or screenshots. Use [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault/security/advisories/new); it is enabled for this repository. Do not post exploit details publicly.

报告请包含 / Include:

- 受影响版本或 commit；
- Cloudflare、Linux 或两者；
- 最小复现步骤和预期/实际结果；
- 威胁模型、前置权限和用户影响；
- 已脱敏、可安全分享的日志或测试；
- 建议修复或临时缓解（可选）。

维护者将尽量确认收件、评估影响、准备修复并协调披露。请在补丁可用前给予合理修复时间。

## Security boundary / 安全边界

### 默认模式

- 主密码只在浏览器中使用 PBKDF2-SHA-256 派生 KEK；
- 条目、分组、最近查看、回收站状态和附件 metadata 在浏览器加密；
- 附件正文先在浏览器加密，再写入 R2 或 Linux 磁盘；
- 后端保存认证材料、包装密钥、密文和运维所需元数据，但不持有可独立恢复 vault key 的服务器密钥。

### 服务器辅助 Passkey

启用服务器辅助 Passkey 后，后端保存由独立服务器 KEK 包装的 vault key，并可在 WebAuthn 用户验证成功后恢复它、创建新会话。该可选功能**改变默认零知识边界**；服务器或前端失陷的影响更大。主密码仍不上传。修改主密码或用户名会撤销辅助凭据。

这与“设备快速解锁”不同：设备快速解锁的包装材料保存在当前浏览器并绑定现有账户/会话，但浏览器配置或整机迁移可能带走本地材料。详见 [`docs/ARCHITECTURE.zh-CN.md`](docs/ARCHITECTURE.zh-CN.md)。

## Out of scope / 不在保证范围

零知识设计不能防御：

- 被篡改的前端资源或恶意服务端在解锁时窃取明文；
- 已被攻陷的终端、浏览器扩展、键盘记录器、屏幕录制或剪贴板监控；
- 用户主动导出、复制、截图或共享明文；
- 弱主密码、泄露的邀请码、错误的 TLS/反代配置；
- 未测试备份、磁盘损坏或管理员删除生产资源；
- 浏览器/整机数据迁移带来的本地快速解锁材料复制风险。

## Production hardening / 生产加固

- 只使用 HTTPS、Secure/HttpOnly/SameSite Cookie 和可信反向代理；
- 使用最小权限的 Cloudflare/主机账户，保护生产配置、KEK 和备份；
- Cloudflare 同点备份 D1 与 R2；Linux 同点备份 SQLite（含一致性快照）和附件目录；
- 监控磁盘、D1/R2 使用量、配额错误、Cron 和部署健康；
- 升级前核对完整配置名称、bindings、routes、triggers 和 migrations；
- 从 annotated tag 构建，校验 `SHA256SUMS`，不要移动旧 tag；
- 不要提交 `.env`、SQLite/D1/R2 导出、真实域名、资源 ID、token、邀请码、KEK、Cookie 或用户数据；
- 定期测试加密备份恢复，并在验证完成前保留源数据。

## Disclosure expectations / 披露期望

修复通常以新补丁版本发布，不覆盖旧 tag。Release notes 会说明受影响功能、升级建议、迁移/配置变化和可公开的验证证据，但不会在安全窗口关闭前公开可直接利用的细节。
