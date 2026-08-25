# v1.1.70 — 批量写入会话边界热修 / Bulk-write session boundary hotfix

[中文](#中文) · [English](#english)

## 中文

### 安全修复

- 批量置顶、取消置顶、批量删除及其补偿写入现在绑定操作开始时捕获的密码库密钥和会话代际。
- 每次写入会在加密前以及网络请求发出前重新验证会话；若用户在操作等待期间锁库并登录另一账户，旧库密文不会被发送到新会话。

### 验证

- 新增“批量操作等待 → 锁库 → 登录第二账户 → 恢复旧操作”的竞态回归测试。
- Chromium 与 WebKit 均验证 320px 批量操作栏无横向溢出，所有操作按钮触控高度至少 44px。

### 升级

建议所有 `v1.1.69` 部署升级到 `v1.1.70`。`v1.1.69` 标签和制品保持不变。

## English

### Security fix

- Bulk pin, unpin, soft-delete, and compensation writes now remain bound to the vault key and session generation captured when the operation starts.
- Every write revalidates that session both before encryption and immediately before issuing the network request. If the vault is locked and another account signs in while an operation is waiting, ciphertext from the old vault is not sent to the new session.

### Verification

- Added a regression test for: pending bulk operation → lock vault → sign in to a second account → release the old operation.
- Verified the bulk action bar in Chromium and WebKit at 320px with no horizontal overflow and touch targets of at least 44px.

### Upgrade

All `v1.1.69` deployments should upgrade to `v1.1.70`. The existing `v1.1.69` tag and artifacts remain unchanged.
