# Pass Vault V2 v1.1.30

[跳转到 English](#english)

## 中文

### 修复

- 附件详情的“← 返回”现在只在手机单栏布局中显示。
- 桌面双栏布局左侧列表始终可见，因此隐藏多余的返回按钮。
- 账号、网站、笔记、附件四类详情保持一致的响应式返回行为。

### 验证

- 新增桌面 1440px 隐藏、手机 390px 显示并可返回列表的回归测试。
- 完整自动化回归 123/123 通过。
- Lint、Typecheck、Build 与差异检查通过。

<a id="english"></a>
## English

### Fixed

- The attachment detail **Back** button is now visible only in the mobile single-column layout.
- It is hidden in the desktop split view where the attachment list remains visible.
- Responsive back-navigation behavior is now consistent across all record types.
