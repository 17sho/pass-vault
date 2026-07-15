# Pass Vault V2 v1.1.35

[跳转到 English](#english)

## 中文

### 改进

- 分组管理弹窗改为固定标题与关闭按钮，只有分组列表独立滚动。
- 分组排序弹窗固定标题、副标题、关闭按钮和账号/网站/笔记/附件分类标签，只有排序列表独立滚动。
- 长列表滚动时仍可随时关闭弹窗或切换资料分类。

### 验证

- 新增 390px 长分组列表自动化回归，验证滚动到底后固定区域的位置不变。
- 完整测试、静态检查、类型检查与构建均通过。

<a id="english"></a>
## English

### Improvements

- The group management dialog now keeps its title and close button fixed while only the group list scrolls.
- The group-order dialog keeps its title, subtitle, close button, and account/website/note/attachment tabs fixed while only the sortable list scrolls.
- Long lists no longer hide critical navigation controls.

### Verification

- Added a 390px long-list regression that scrolls each list to the end and verifies the fixed controls remain stationary.
- The full test, lint, type-check, and build suites pass.
