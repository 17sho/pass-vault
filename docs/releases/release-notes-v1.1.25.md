# Pass Vault V2 v1.1.25

[跳转到 English](#english)

## 中文

### 新增

- “更多”菜单新增“分组排序”。
- 账号、网站、笔记、附件可以分别调整自定义分组的上下顺序。
- 常用分组可以移动到顶部；“全部”和“默认”固定在最前面且不可移动。
- 调整后的顺序会同步用于分组面板和新建/编辑资料时的分组选择器。

### 隐私与兼容性

- 分组顺序随零知识加密的分组注册表保存；网络和服务端仍看不到分组名称。
- 旧数据和旧备份保持兼容，不需要迁移数据库。

### 验证

- 完整测试 118/118、Lint、Typecheck、Build 通过。
- Cloudflare/D1 与 Linux/SQLite 双端生产移动端 Smoke 通过。
- Chromium 320px 与 WebKit 390px 均无横向溢出。

---

<a id="english"></a>
## English

### Added

- Added “Group order” under the More menu.
- Custom groups can be reordered independently for Accounts, Websites, Notes, and Attachments.
- Frequently used groups can be moved upward; All and Default remain pinned at the top.
- The saved order is reflected in both the group panel and create/edit group selectors.

### Privacy and compatibility

- Ordering remains inside the zero-knowledge encrypted group registry; group names stay hidden from the network and server.
- Existing data and backups remain compatible with no database migration.

### Verification

- Full 118/118 tests, lint, typecheck, and build passed.
- Production mobile smoke passed on Cloudflare/D1 and Linux/SQLite.
- No horizontal overflow at Chromium 320px or WebKit 390px.
