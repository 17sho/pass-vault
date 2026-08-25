# Pass Vault V2 v1.1.28

[跳转到 English](#english)

## 中文

### 修复

- 顶部“更多”菜单现在会在点击页面其他位置时自动收起。
- 打开资料条目的三点操作菜单时，会先关闭顶部“更多”菜单；再次打开顶部“更多”时，也会关闭条目操作菜单。
- 点击资料进入详情或切换账号、网站、笔记、附件分类时，顶部菜单会同步收起。
- 同步维护 `aria-expanded` 状态，避免视觉状态与无障碍状态不一致。

### 验证

- 新增 390px 手机宽度菜单互斥与自动收起回归测试。
- 完整自动化测试 121/121 通过。
- Lint、TypeScript 类型检查、构建和生产资源检查通过。

---

<a id="english"></a>
## English

### Fixed

- The top “More” menu now closes when the user interacts elsewhere on the page.
- Opening a record’s three-dot action menu closes the top menu, and opening the top menu closes any record menu.
- Opening record details or switching categories also closes the top menu.
- `aria-expanded` is kept in sync with the visible menu state.

### Verification

- Added a 390px mobile regression test for menu mutual exclusion and dismissal.
- Full automated suite: 121/121 passed.
- Lint, TypeScript checks, build, and production asset checks passed.
