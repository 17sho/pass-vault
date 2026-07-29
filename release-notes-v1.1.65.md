# v1.1.65 — 移动平台快速解锁兼容 / Mobile quick-unlock compatibility

## 中文

- 允许已完成 Face ID、指纹或设备密码验证的同步型平台凭据用于快速解锁，解决同一手机上 Safari 与 Chrome 均无法开启的问题。
- 系统凭据可能由 Apple、Google 或其他设备账户同步；快速解锁材料保存在启用功能的当前浏览器。浏览器配置或整机数据迁移可能连同该材料一起迁移。
- 仅同步系统凭据的其他设备不能直接解锁：仍需匹配的浏览器本地记录、凭据 ID、PRF 输出、系统用户验证及原绑定有效服务器会话。
- 主密码、生物信息、PRF 输出和裸保险库密钥仍不会保存或上传。

## English

- Allows sync-capable platform credentials after Face ID, fingerprint, or device-passcode verification, fixing quick-unlock setup in Safari and Chrome on modern phones.
- The system credential may sync through Apple, Google, or another device account. Quick-unlock material is stored in the browser where it was enabled; browser-profile or full-device migration may carry that material with it.
- A synced credential alone cannot unlock another device: a matching browser-local record, exact credential ID, PRF output, system user verification, and the originally bound valid server session are still required.
- The master password, biometric data, PRF output, and raw vault key are never stored or uploaded.
