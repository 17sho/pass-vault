# v1.1.71 — 批量分组会话边界补充热修 / Bulk-group session boundary follow-up

## 中文

- 批量设置分组的正向写入和失败补偿现在显式绑定操作开始时捕获的密码库密钥和会话代际。
- 若批量分组等待期间锁库并登录另一账户，旧密码库密文不会写入新会话。
- `v1.1.71` 包含 `v1.1.70` 的批量置顶、取消置顶和删除会话边界修复；建议直接升级到本版本。

## English

- Bulk-group forward and compensation writes are now explicitly bound to the vault key and session generation captured when the operation starts.
- If the vault is locked and another account signs in while bulk grouping is pending, ciphertext from the old vault is not written through the new session.
- `v1.1.71` includes the bulk pin, unpin, and soft-delete session-boundary fixes from `v1.1.70`; upgrade directly to this release.
