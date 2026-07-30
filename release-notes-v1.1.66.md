# v1.1.66 — Cloudflare 服务器辅助 Passkey / Cloudflare server-assisted Passkey

## 中文

### 新增

- 在安全中心新增可撤销的服务器辅助 Passkey：有效会话内注册平台凭据后，可在本地 `vaultKey` 已清除的锁定状态下，通过系统用户验证重新解锁，无需再次输入主密码。
- 本次 GitHub Release 仅发布 Cloudflare Worker + D1 制品；Linux 稳定制品暂时保持 v1.1.65，不在本 Release 中提供。
- 新增 Cloudflare migration `0009_passkey_assisted_unlock.sql`，用于辅助凭据、challenge 和失败限速槽。

### 安全边界

- 这项可选功能会把包装后的 32 字节保险库密钥保存到服务器，**改变原纯客户端零知识边界**：服务器配合一次通过用户验证的 Passkey 会话可以恢复保险库密钥。服务器仍不保存主密码、生物信息或明文保险库密钥。
- 注册和撤销要求有效 HttpOnly 会话、CSRF，注册还验证当前主密码。后续认证允许在没有现有会话时匿名获取并提交一次性 challenge；`userVerification: required`、精确 RP ID/Origin、凭据归属和 counter 校验通过后创建新 HttpOnly 会话。
- 失败验证前会原子预占请求专属限速槽；成功只释放本请求槽。SQLite 在同一事务提交 counter、session 与槽释放；D1 通过 `changes()` 链保证 CAS 失败时不创建 session。
- 修改主密码或用户名会撤销全部服务器辅助 Passkey。KEK 丢失或直接轮换会使既有辅助凭据不可用，应先撤销并重新注册。

### 升级

1. 先在同一逻辑时间点备份并验证 D1 + R2。
2. Cloudflare 在部署代码前应用全部待执行 migration，包括 `0009_passkey_assisted_unlock.sql`。
3. 为该 Worker 生成独立 `PASSKEY_UNLOCK_KEK`，并配置精确的 `PASSKEY_RP_ID` 与 `PASSKEY_ORIGIN`。
4. 部署后确认首页加载 `app.mjs?v=1.1.66`，再用可清理测试账户完成注册、启用、锁定、Passkey 重新解锁、撤销与清理闭环。

## English

### Added

- Adds a revocable server-assisted Passkey in Security Center. After registering a platform credential from a valid session, a locked browser whose local `vaultKey` has been cleared can unlock again through system user verification without re-entering the master password.
- This GitHub Release publishes Cloudflare Worker + D1 artifacts only. The stable Linux artifact remains v1.1.65 and is not included in this Release.
- Adds Cloudflare migration `0009_passkey_assisted_unlock.sql` for assisted credentials, challenges, and failure-rate slots.

### Security boundary

- This optional feature stores the wrapped 32-byte vault key on the server and **changes the former client-only zero-knowledge boundary**: the server, together with one user-verified Passkey session, can recover the vault key. The server still does not store the master password, biometric data, or plaintext vault key.
- Registration and revocation require a valid HttpOnly session and CSRF, and registration also verifies the current master password. Later authentication may obtain and submit a single-use challenge with no existing session; after `userVerification: required`, exact RP ID/Origin, credential ownership, and counter checks pass, it creates a new HttpOnly session.
- Each completion attempt atomically reserves its own rate-limit slot before expensive verification; success releases only that slot. SQLite commits the counter, session, and slot release in one transaction. D1 uses a `changes()` chain so a failed CAS cannot create a session.
- Changing the master password or username revokes every server-assisted Passkey. Losing or directly rotating the KEK makes existing assisted credentials unusable; revoke and re-register them first.

### Upgrade

1. Back up and verify D1 + R2 at the same logical point.
2. On Cloudflare, apply every pending migration, including `0009_passkey_assisted_unlock.sql`, before deploying code.
3. Generate an independent `PASSKEY_UNLOCK_KEK` for the Worker and configure its exact `PASSKEY_RP_ID` and `PASSKEY_ORIGIN`.
4. After deployment, confirm the page loads `app.mjs?v=1.1.66`, then use a disposable account to complete registration, enablement, lock, Passkey unlock, revocation, and cleanup.
