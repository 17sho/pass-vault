# Pass Vault V2 v1.1.36

[跳转到 English](#english)

## 中文

### 修复

- 手机进入账号/网站/笔记/附件详情后，再点顶部“更多”，下拉菜单不再被详情顶栏遮挡。
- 提升顶部导航与“更多”菜单层级，保证详情页中菜单项可完整显示并点击。

### 验证

- 新增 390px 自动化回归：详情打开后检查“更多”菜单每项 `elementFromPoint` 命中菜单本身。
- 全量测试 **126/126** 通过。
- Lint / Typecheck / Build 通过。

## English

### Fixed

- Opening the top “More” menu from a mobile detail view no longer gets covered by the detail header.
- Raised the header/menu stacking order so every menu item remains visible and clickable over the detail pane.

### Verification

- Added a 390px regression that asserts each “More” menu item is hit-tested above the detail pane.
- Full suite **126/126** passed.
- Lint / Typecheck / Build passed.
