# Pass Vault V2 v1.1.23

[跳转到 English](#english)

## 中文

### 修复

- 完全移除“新建什么资料？”标题在弹窗打开后显示的蓝色焦点框。
- 标题仍保留程序化焦点用于弹窗语义和屏幕阅读器，但不绘制可见边框。
- 键盘用户按 Tab 后，第一个资料类型仍显示正常焦点提示；Escape 和关闭后的焦点恢复保持不变。
- 前端资源缓存键更新至 `v1.1.23`，避免浏览器继续使用旧 CSS。

### 验证

- 完整自动化测试：116/116 通过。
- Lint、TypeScript 类型检查和生产构建通过。
- Cloudflare Chromium 320px 与 Linux WebKit 390px 生产验证均确认标题 `outline-style: none`、`box-shadow: none`，且页面无横向溢出。

## English

### Fixes

- Completely removed the blue focus outline shown around the “What would you like to create?” heading when the dialog opens.
- The heading keeps programmatic focus for dialog semantics and screen-reader context without drawing a visible frame.
- Keyboard users still receive a normal visible focus indicator on the first record type after pressing Tab; Escape and focus restoration remain unchanged.
- Bumped the frontend asset cache key to `v1.1.23` to prevent stale CSS.

### Verification

- Full automated test suite: 116/116 passed.
- Lint, TypeScript typecheck, and production build passed.
- Cloudflare Chromium at 320px and Linux WebKit at 390px both confirmed `outline-style: none`, `box-shadow: none`, and no horizontal overflow.
