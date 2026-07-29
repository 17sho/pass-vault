# v1.1.63 — 此设备快速解锁 / Device Quick Unlock

## 中文

### 新增
- 安全中心新增可选的“此设备快速解锁”。开启时需再次输入当前主密码，并完成平台WebAuthn用户验证。
- 自动锁定后，锁定页提供独立的“使用此设备快速解锁”按钮；不支持WebAuthn PRF的浏览器继续使用主密码。

### 安全边界
- 主密码、生物信息、裸保险库密钥及设备PRF输出不会发送至服务端。
- 本机IndexedDB仅保存由PRF派生密钥加密的AES-256-GCM密文，并绑定用户名与当前公开会话ID。
- 快速解锁先确认HttpOnly会话、用户名和公开会话ID仍匹配，再调用设备验证；不会创建新的登录会话。
- 关闭功能、主动退出、修改用户名或主密码会删除本机材料并跨标签撤销。

### 兼容性
- 需要安全上下文、平台WebAuthn验证器及PRF扩展支持。
- 系统验证可能显示Face ID、Touch ID、Windows Hello、设备PIN或其他平台验证方式，具体由设备和浏览器决定。
- 主密码登录始终保留为回退方式。

## English

### Added
- Optional “Quick unlock on this device” in Security Center. Enabling it requires the current master password and platform WebAuthn user verification.
- After an automatic lock, the lock screen provides a dedicated “Quick unlock on this device” action. Browsers without WebAuthn PRF support continue to use the master password.

### Security boundaries
- The master password, biometric data, raw vault key, and device PRF output are never sent to the server.
- IndexedDB stores only AES-256-GCM ciphertext protected by a PRF-derived key and bound to the username and current public session ID.
- Quick unlock verifies the HttpOnly session, username, and public session ID before requesting device verification and does not create a new login session.
- Disabling the feature, explicitly signing out, or changing the username/master password removes local material and revokes it across tabs.

### Compatibility
- Requires a secure context, a platform WebAuthn authenticator, and PRF extension support.
- The system prompt may use Face ID, Touch ID, Windows Hello, a device PIN, or another platform method depending on the browser and device.
- Master-password login always remains available as fallback.
