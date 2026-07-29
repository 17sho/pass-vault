# v1.1.64 — iPhone Safari快速解锁兼容修复 / iPhone Safari Quick Unlock Compatibility

[中文](#中文) · [English](#english)

## 中文

### 修复
- 修复iPhone Safari完成Face ID、Touch ID或设备密码验证后，网页仍可能误报“设备未完成本机用户验证”的问题。
- Safari未提供`getAuthenticatorData()`便捷接口时，改为从标准WebAuthn `attestationObject.authData`读取验证器标志。

### 安全边界
- 仍严格要求本机用户验证（UV），并拒绝可备份或同步的凭据（BE）。
- 缺失、截断或畸形CBOR数据一律安全失败；PRF输出仍须恰好32字节。
- 不改变零知识、会话绑定、主密码回退或退出/改名/改密撤销策略。

### 升级
- 不新增数据库迁移，无需重新加密保险库。
- 更新应用后，在iPhone Safari安全中心重新尝试开启“此设备快速解锁”。

如果这个项目对你有帮助，欢迎点一个Star。

## English

### Fixed
- Fixed an iPhone Safari compatibility issue where quick unlock could report that local user verification was incomplete after Face ID, Touch ID, or the device passcode had completed.
- When Safari does not expose the `getAuthenticatorData()` convenience method, authenticator flags are now read from the standard WebAuthn `attestationObject.authData` field.

### Security boundaries
- Local user verification (UV) remains mandatory, and backup-eligible/synced credentials (BE) remain rejected.
- Missing, truncated, or malformed CBOR fails closed; PRF output must still be exactly 32 bytes.
- Zero-knowledge behavior, session binding, master-password fallback, and logout/credential-change revocation are unchanged.

### Upgrade
- No database migration or vault re-encryption is required.
- After updating, retry enabling “Quick unlock on this device” from Security Center in iPhone Safari.

If this project is useful to you, a Star is appreciated.
