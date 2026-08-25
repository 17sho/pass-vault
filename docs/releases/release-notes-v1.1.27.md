# Pass Vault V2 v1.1.27

[跳转到 English](#english)

## 中文

### 修复

- 修复手机窄屏下，刷新或重新登录后点击已有附件无法进入附件详情和图片预览的问题。
- 修复附件重新加载后缺少客户端类型标记，导致点击时误走普通资料详情逻辑的问题。
- 宽屏右侧详情与手机单页详情现在采用一致的附件打开路径。

### 验证

- 新增“上传附件 → 刷新 → 重新登录 → 手机宽度点击附件 → 显示预览”的回归覆盖。
- 完整自动化测试 120/120 通过。
- Lint、TypeScript 类型检查、构建及生产资源检查通过。

---

<a id="english"></a>
## English

### Fixed

- Fixed existing attachments failing to open their detail and image preview on narrow mobile screens after a reload or a new login.
- Restored the client-side attachment type marker when loading encrypted attachment metadata, preventing attachment rows from entering the regular record-detail path.
- Wide-screen detail and mobile single-page detail now use the same attachment opening path.

### Verification

- Added regression coverage for upload → reload → login → tap attachment at mobile width → preview visible.
- Full automated suite: 120/120 passed.
- Lint, TypeScript checks, build, and production asset checks passed.
