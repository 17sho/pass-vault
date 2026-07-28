# v1.1.61 - Security Center and session controls

[中文](#中文) · [English](#english)

## 中文

### 新增

- “更多”菜单新增**安全中心**，集中管理本机自动锁定时间和剪贴板自动清除时间。
- 显示当前及其他登录会话的登录时间、最近活动、设备类型、浏览器类别和登录IP，并明确标记当前设备。
- 支持单独注销其他会话，以及一键注销其他所有设备；当前会话始终保留，不能被误注销。
- 剪贴板清除前会确认内容仍是本应用最后复制的密码，避免覆盖用户后来复制的其他内容。

### 安全与隐私

- Cloudflare仅使用平台提供的`CF-Connecting-IP`；Linux仅使用明确配置的可信代理头，拒绝多值或畸形IP并回退连接地址。
- 只保存粗粒度设备/浏览器类别，不保存完整User-Agent或浏览器指纹。
- 自动锁定和剪贴板设置仅保存在当前浏览器，可离线生效；会话刷新和远程注销需要联网。
- 会话列表只返回随机公开会话ID及必要元数据，不返回Cookie、令牌哈希、CSRF或用户ID。

### 升级

Cloudflare升级前必须配对备份D1与R2，再执行`0008_session_metadata.sql`并部署代码。Linux在启动时幂等执行等效SQLite迁移。历史会话保持有效，但IP和设备显示为“未知”；新登录才记录新元数据。无需重加密密码库。

### 验证与限制

- 发布源码全量测试`211/211`通过；Cloudflare/Linux平台包均在全新解压目录完成依赖安装、包内测试和类型/语法检查。真实本地D1迁移、SQLite两次幂等迁移、Wrangler Worker+Assets dry-run及生产依赖审计（0个漏洞）均通过。
- 历史会话没有可追溯的IP或设备数据，因此只显示“未知”；只有升级后的新登录会记录这些安全元数据。
- 自动锁定和剪贴板设置不会跨浏览器或设备同步；会话刷新/注销需要联网。Cloudflare与Linux后端的账户、会话、数据库及附件继续完全独立，不会互相同步或故障切换。

## English

### Added

- A new **Security Center** under More consolidates the local idle-lock and clipboard-clear settings.
- View current and other sessions with sign-in time, recent activity, device type, browser category, and login IP; the current device is clearly marked.
- Revoke one other session or revoke all other devices while always preserving the current session.
- Clipboard cleanup verifies that the clipboard still contains the password last written by the vault, so later user-copied content is never cleared.

### Security and privacy

- Cloudflare trusts only the platform-provided `CF-Connecting-IP`. Linux accepts only an explicitly configured trusted proxy header, rejects malformed or multi-value IPs, and falls back to the socket address.
- Only coarse device/browser categories are stored; full User-Agent strings and browser fingerprints are not retained.
- Idle-lock and clipboard settings remain local to the current browser and work offline. Session refresh and remote revocation require connectivity.
- The sessions API returns only a random public session ID and necessary metadata—never cookies, token hashes, CSRF tokens, or user IDs.

### Upgrade

For Cloudflare, make a paired D1/R2 backup, apply `0008_session_metadata.sql`, then deploy. Linux performs the equivalent SQLite migration idempotently at startup. Existing sessions remain valid but show unknown IP/device metadata; new sign-ins populate the new fields. No vault re-encryption is required.

### Verification and limitations

- The complete source suite passed `211/211`. Both Cloudflare and Linux archives completed fresh-extraction dependency installation, packaged tests, and type/syntax checks. A real local D1 migration, two idempotent SQLite migration runs, a Wrangler Worker+Assets dry run, and the production dependency audit (0 vulnerabilities) also passed.
- Historical sessions have no trustworthy IP or device history and therefore display “Unknown”; only sign-ins after the upgrade populate this security metadata.
- Idle-lock and clipboard settings do not sync across browsers or devices, and session refresh/revocation requires connectivity. Cloudflare and Linux accounts, sessions, databases, and attachments remain fully independent, with no synchronization or failover between them.

If this release is useful, a GitHub Star helps others discover the project. / 如果这个版本对你有帮助，欢迎点一个Star支持项目。