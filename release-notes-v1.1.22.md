# Pass Vault V2 v1.1.22

[跳转到 English](#english)

## 中文

### 修复

- 修复“新建什么资料？”弹窗刚打开时，右上角关闭按钮自动出现绿色焦点框的问题。
- 弹窗打开后将初始焦点放在标题上；鼠标或触屏打开时关闭按钮不再呈现选中状态。
- 保留完整键盘可访问性：按 Tab 会进入第一个资料类型，按 Escape 可关闭弹窗并将焦点恢复到“+ 新建”。
- 前端资源缓存键更新至 `v1.1.22`，避免浏览器继续使用旧资源。

### 验证

- 完整自动化测试：116/116 通过。
- Lint、TypeScript 类型检查和生产构建通过。
- Cloudflare：Chromium 320px 生产验证通过。
- Linux：WebKit 390px 生产验证通过。
- 两端均确认：初始焦点为弹窗标题、关闭按钮无绿色焦点框、页面无横向溢出。

## English

### Fixes

- Fixed the green focus ring that appeared automatically around the top-right close button when the “What would you like to create?” picker opened.
- Initial focus now lands on the dialog heading, so pointer/touch users no longer see the close button as preselected.
- Keyboard accessibility remains intact: Tab moves to the first record type, Escape closes the dialog, and focus returns to “+ New”.
- Bumped the frontend asset cache key to `v1.1.22` to prevent stale resources.

### Verification

- Full automated test suite: 116/116 passed.
- Lint, TypeScript typecheck, and production build passed.
- Cloudflare production verified with Chromium at 320px.
- Linux production verified with WebKit at 390px.
- Both targets confirmed the heading receives initial focus, the close button has no initial focus ring, and no horizontal overflow occurs.
