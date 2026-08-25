# Pass Vault V2 v1.1.29

[跳转到 English](#english)

## 中文

### 新增

- 在顶部“更多”菜单新增“置顶排序”。
- 账号、网站、笔记、附件四类资料分别维护自己的置顶顺序。
- 排序窗口只显示当前已经置顶的资料，可通过上移、下移调整顺序。
- 调整后的顺序会应用到当前分类、分组、模糊搜索与附件类别筛选结果。

### 隐私与兼容性

- 置顶顺序 `pinRank` 与资料内容一起在浏览器内加密，服务端只保存密文。
- 不新增 D1、SQLite 或附件服务端明文字段。
- 旧版本中已置顶但没有顺序字段的资料保持原有稳定顺序；首次调整时自动生成连续顺序。
- 取消置顶时同步移除该资料的顺序字段。

### 验证

- 完整自动化回归 122/122 通过。
- 通过 320px 移动端排序、刷新重新登录持久化、密文载荷和横向溢出验证。
- Lint、Typecheck、Build 与差异检查通过。

<a id="english"></a>
## English

### Added

- Added **Pinned order** to the top **More** menu.
- Accounts, websites, notes, and attachments maintain independent pinned ordering.
- The dialog lists pinned records only and provides accessible move-up/down controls.
- The custom order applies consistently to category, group, fuzzy-search, and attachment-filter results.

### Privacy and compatibility

- `pinRank` is encrypted in-browser with each record; the server receives ciphertext only.
- No plaintext D1, SQLite, or attachment schema fields were added.
- Existing pinned records without ranks preserve their stable order until first reordered.
- Unpinning removes the rank.
