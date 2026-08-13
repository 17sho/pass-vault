# PassVault v2.2.0

<a id="中文"></a>
[中文](#中文) · [English](#english)

> Cloudflare Worker / D1 / R2 与独立 Admin Worker 发行版

v2.2.0 在 v2.1.0 自定义资料基础上，新增加密历史与恢复中心、安全分享 v2、跨页收藏/置顶状态，以及完整的 Cloudflare 运维管理能力。本次公开资产同时提供 Cloudflare 与 Linux 独立包；**本轮生产功能与 Admin 管理能力仅在 Cloudflare 版完成验证和部署，Linux 包主要保持共享前端与既有服务端兼容，不代表新增 Cloudflare 协议能力已在 Linux 生产环境验证。**

## 中文

### 资料历史与恢复中心

- 条目每项最多保留最近 **10 个加密历史版本**，当前版本更新成功后才原子归档旧密文。
- 附件支持 metadata 与内容版本；每附件最多 10 版、每用户最多 50 版。
- 历史版本可在浏览器内比较字段差异并恢复；密码、TOTP、secret 等敏感变化默认隐藏。
- 原“回收站”升级为“恢复中心”：支持预览、单项/批量恢复、批量永久删除和清空。
- 删除分组时写入加密墓碑；恢复资料时可同时恢复原分组，服务端看不到分组名称或资料关系。
- 锁库、退出和隐私遮罩会清理预览 DOM、Blob URL 与异步操作引用。

### 安全分享 v2

- 单个加密分享包可包含 **1–50 条资料**，并可携带最多 **8 个附件、25 MiB 附件密文**。
- 支持可选分享密码：使用 PBKDF2-SHA-256（310,000 次）派生 KEK 包装随机 package key；密码和派生密钥不发送到服务端。
- 支持精确到期、查看次数、单浏览器/一次性消费、撤销和分享管理。
- 分享采用 prepare / upload / commit 流程；未完成上传、撤销或过期对象由维护任务安全回收。
- manifest、资料和附件均使用 AES-GCM 加密，并通过 token/object AAD 隔离；旧 v1 分享继续兼容。
- 匿名分享页使用 `no-store`、`noindex,nofollow` 和 no-referrer，并在读取 fragment 后立即清除地址栏密钥材料。

### 收藏、置顶与资料体验

- 收藏/置顶状态从资料正文中独立为加密注册表，减少正文 revision 冲突。
- 跨标签页更新采用字段级补丁合并，保留远端同项的其他状态。
- 优化自定义字段条件显示、批量操作、分组、更多菜单及多资料交互。
- 统一弹窗滚动、焦点、手机窄屏布局与隐私状态清理。

### Cloudflare Admin 管理平台

- 独立 Admin Worker，使用 Cloudflare Access 邮箱白名单保护；未授权请求不返回管理页面。
- 展示用户、加密条目、附件、会话、D1/R2 用量、健康状态、趋势、安全事件和维护任务。
- 管理注册状态和注册码摘要，支持强制退出、删除用户和安全重试维护任务。
- 用户配额支持条目数、附件数、附件总容量和有效期四个维度；恢复默认会删除覆盖配置。
- 主站 Worker 在所有写路径原子执行配额门禁，Admin 仅负责管理与展示，避免 TOCTOU 绕过。
- 配额预警按 70% / 85% / 95% 分级；零上限但已有用量会单独置顶。
- 用户风险筛选覆盖接近配额、长期未登录、未设置 Passkey、活跃会话异常；新用户不会被立即误报为长期未登录。
- 用户详情显示每个用户最近 20 条配额调整历史，仅含管理员、目标用户、动作、时间和非敏感差异。
- 所有管理写操作使用同源校验和审计；关键 D1 操作与审计原子提交，不记录对象键、IP、凭据或零知识内容。

### 安全与数据边界

- 零知识内容仍只以密文 envelope 保存；服务端不接收资料、模板、历史版本、恢复墓碑或分享明文。
- 新增安全事件只保存聚合分类与计数，不保存用户名、IP、凭据或秘密值。
- R2 删除会检查当前附件、附件历史和分享对象引用；并发维护使用条件更新避免重复扣减。
- 管理页面启用 CSP、HSTS、`no-store`、拒绝 framing、严格 referrer/permissions policy。
- 发行包使用脱敏 Wrangler 模板，不包含真实域名、管理员邮箱、Cloudflare 资源 ID、数据库备份或凭据。

### 升级说明

Cloudflare 用户应按顺序应用新增 migrations `0021`–`0028`，然后分别部署主 Worker 与可选 Admin Worker：

```bash
npm ci
npm run build
npx wrangler d1 migrations apply <YOUR_D1_DATABASE> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/admin-worker/wrangler.jsonc
```

部署 Admin 前，请自行创建 Cloudflare Access Application，并将 Admin Worker 的 D1/R2 绑定指向与主 Worker 相同的资源。`ADMIN_EMAILS`、域名和资源标识均须替换为自己的值，敏感配置请使用 Wrangler secrets。

### 兼容性与限制

- `0021`–`0028` 为 Cloudflare D1 migrations；不要对 Linux SQLite 数据库执行这些文件。
- 安全分享 v2、附件历史、Cloudflare 配额强制和 Admin 管理平台是 Cloudflare 版能力。
- Linux 发行包继续提供独立 Node/SQLite 部署，但本轮未部署或生产验证 Linux 新功能路径。
- 升级前请备份 D1 和 R2；历史/分享对象会增加存储占用，请根据业务设置配额和保留策略。

---

<a id="english"></a>
## English

### History and Recovery Center

- Keeps up to **10 encrypted entry revisions per item**, archiving the previous ciphertext only after a successful atomic update.
- Adds attachment metadata/content history: up to 10 versions per attachment and 50 per user.
- Compares field-level changes locally and restores a selected revision; password, TOTP, and secret changes stay hidden by default.
- Upgrades Trash into a Recovery Center with preview, individual/bulk restore, permanent deletion, and clear-all actions.
- Stores deleted-group tombstones in an encrypted registry so a record and its original group can be restored without exposing group names or relationships to the server.
- Clears preview DOM, Blob URLs, selection state, and asynchronous references on lock, logout, or privacy shielding.

### Secure Share v2

- One encrypted package can contain **1–50 records**, up to **8 attachments**, and up to **25 MiB** of attachment ciphertext.
- Optional passwords wrap a random package key with a PBKDF2-SHA-256 KEK (310,000 iterations); passwords and derived keys never leave the browser.
- Supports precise expiration, view limits, one-browser/one-time consumption, revocation, and share management.
- Uses a prepare/upload/commit lifecycle; incomplete, revoked, and expired objects are reclaimed by safe maintenance jobs.
- Encrypts manifests, records, and objects with AES-GCM and token/object-scoped AAD while preserving v1 share compatibility.
- Anonymous pages use `no-store`, `noindex,nofollow`, and no-referrer, and remove fragment key material from the address bar immediately.

### Favorites, Pins, and Record UX

- Moves favorite/pin state out of record bodies into a separate encrypted registry to reduce revision conflicts.
- Replays field-level patches across tabs while preserving unrelated remote marker state.
- Improves conditional custom fields, bulk actions, grouping, More menus, dialogs, focus handling, narrow-screen layouts, and privacy cleanup.

### Cloudflare Admin Platform

- Ships an independent Admin Worker protected by an exact Cloudflare Access email allowlist.
- Shows users, encrypted record/attachment/session counts, D1/R2 usage, health, trends, security events, and maintenance tasks.
- Manages registration state/invite digest, session revocation, user deletion, and safe maintenance retries.
- Provides four-dimensional per-user quotas: entry count, attachment count, total attachment ciphertext, and optional expiry; resetting removes the override.
- Enforces quotas atomically in every main Worker write path; the Admin Worker only aggregates and manages policy.
- Grades quota warnings at 70% / 85% / 95%, with explicit priority for zero-limit overages.
- Filters user risk by quota pressure, inactivity, missing Passkeys, and anomalous active sessions without misclassifying newly created accounts as inactive.
- Shows the latest 20 quota changes per user with only actor, target, action, time, and allowlisted non-sensitive differences.
- Applies same-origin checks and audit logging to admin writes, atomically coupling critical D1 mutations with their audits.

### Security and Data Boundaries

- Zero-knowledge content remains encrypted envelopes; the server does not receive record, template, history, recovery-registry, or share plaintext.
- Security events store aggregate categories and counts only—no usernames, IPs, credentials, or secret values.
- R2 cleanup checks current attachment, attachment-history, and share references, with conditional updates preventing duplicate accounting under concurrency.
- Admin responses use CSP, HSTS, `no-store`, frame denial, and strict referrer/permissions policies.
- Public archives contain sanitized Wrangler templates and exclude production domains, admin emails, Cloudflare resource IDs, backups, and credentials.

### Upgrade

Cloudflare deployments must apply D1 migrations `0021`–`0028` in order, then deploy the main Worker and optional Admin Worker:

```bash
npm ci
npm run build
npx wrangler d1 migrations apply <YOUR_D1_DATABASE> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/admin-worker/wrangler.jsonc
```

Create a Cloudflare Access Application for the Admin Worker and point its D1/R2 bindings at the same resources as the main Worker. Replace all placeholder domains, resource identifiers, and `ADMIN_EMAILS`; store sensitive values with Wrangler secrets.

### Compatibility and Limits

- Migrations `0021`–`0028` are Cloudflare D1 migrations and must not be applied to Linux SQLite.
- Secure Share v2, attachment history, Cloudflare quota enforcement, and the Admin platform are Cloudflare-specific capabilities.
- The Linux archive remains available for independent Node/SQLite deployments, but new Linux feature paths were not deployed or production-verified in this release cycle.
- Back up D1 and R2 before upgrading; history/share objects increase storage usage, so configure quotas and retention policies accordingly.

## Verification / 校验

Verify downloaded files with `SHA256SUMS`. If this project helps you, a GitHub Star is always appreciated.
