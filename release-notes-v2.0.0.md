# Pass Vault V2 v2.0.0（服务器版 / Linux Server Edition）

> 本发布为 **服务器版（Linux Node.js + SQLite 自托管）**。适用部署指南：
> [中文](docs/server-deployment.zh-CN.md) · [English](docs/server-deployment.en.md)
>
> This release is the **Linux server edition (self-hosted Node.js + SQLite)**.

[跳转到 English](#english)

## 中文

### 新增功能

- **隐私模式（界面防窥）**：三档强度 + 切换到后台自动遮挡 + 详情页逐项临时显示，密码库可在公共场合使用时降低被窥视的风险（界面级保护，非额外加密）。
- **自定义资料字段**：账号类型支持自定义字段（字段名 + 类型 + 内容 + 排序，密码字段默认隐藏可复制），详情页按类型动态展示。
- **加密回收站**：删除的条目进入加密回收站，可恢复或彻底清除。
- **本地全站搜索**：在更多菜单中提供全站模糊搜索，解密后仅在浏览器内匹配。
- **密码生成器**：随机强密码生成；**空闲自动锁定** 与 **自动锁定时间设置**。
- **密码历史 / 修改时间** 与 **最近查看** 记录。
- **加密 TOTP 条目**：账号类型支持加密的一次性验证码（TOTP）。
- **安全中心会话控制**：查看并撤销其他会话；改用户名/改密码时自动撤销全部会话。
- **安全设备快速解锁**：可选的安全设备快速解锁流程。
- **条目创建时间**（`created_at`）：服务端记录条目创建时间，与既有更新时间并存。

### 修复与改进

- 自定义资料弹窗、分组排序/置顶补齐自定义资料 tab，长分组名单行省略。
- 移动端表单与弹窗布局全面梳理，账号凭证行拖拽手柄移到标题行右上角。
- 分组选中框在 iOS Safari 的裁切、详情退场动画卡顿、深色模式下的浅色底问题。
- 反代后按可信 `CLIENT_IP_HEADER` 隔离限流，防止全站登录 DoS。
- 部署健康门禁与回收站流程加固。

### 验证

- 完整自动化测试通过；Lint、TypeScript 类型检查、构建及生产资源检查通过。
- 本发布已在 passkey.23cm.me 服务器版生产实例部署运行并通过真实浏览器回归验证。

### 安全

- 详细架构与安全模型见 `README.md` 与 `SECURITY.md`。
- 服务端只保存认证材料、被包装的 vault key、条目/附件元数据密文与附件密文对象，不接触主密码、vault key 或明文。

---

<a id="english"></a>
## English

### What's New

- **Privacy mode (shoulder-surfing protection)**: three intensity levels + auto-hide when switching away + per-field temporary reveal in details.
- **Custom fields for account records**: editable custom fields (name/type/value/order, password fields hidden by default with reveal-on-click).
- **Encrypted recycle bin**: deleted entries go to an encrypted recycle bin; restore or purge.
- **Local full-site search** from the More menu; decrypted matches stay in the browser.
- **Password generator** and **idle auto-lock** with configurable lockout time.
- **Password history / modified time** and **recently viewed**.
- **Encrypted TOTP entries**.
- **Security center session controls**: view and revoke other sessions; password/username changes revoke all sessions.
- **Secure device quick unlock**.
- **Entry creation time** (`created_at`) recorded server-side.

### Fixes & Improvements

- Custom-record dialogs, group ordering/pinning for the custom tab, and long-name ellipsis.
- Mobile form & dialog layout overhaul; account credential drag handle moved to the header.
- iOS Safari group-selection clipping, detail-exit animation jank, dark-mode contrast fixes.
- Trusted `CLIENT_IP_HEADER` rate limiting behind a reverse proxy to prevent site-wide login DoS.
- Hardened deployment health gate and recycle-bin flow.

### Verification

- Full automated test suite passes; lint, type-check, build, and production-asset checks pass.
- This release is deployed and verified on the passkey.23cm.me server-edition production instance.

### Security

- See `README.md` and `SECURITY.md` for architecture and security model.
- The server stores only auth material, the wrapped vault key, ciphertext metadata, and attachment ciphertext — never the master password, vault key, or plaintext.
