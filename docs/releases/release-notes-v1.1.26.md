# Pass Vault V2 v1.1.26

[跳转到 English](#english)

## 中文

### 新增

- 账号、网站、笔记和附件现在都支持置顶与取消置顶。
- 可从列表条目的“更多操作”菜单或详情标题栏操作。
- 置顶资料会优先显示在当前菜单、分组、搜索结果和附件类别筛选结果顶部。
- 列表显示轻量“置顶”标记，刷新及重新登录后仍然保留。

### 隐私与兼容性

- 置顶状态随条目内容在浏览器中加密，服务端只保存密文。
- 不新增服务端可见的置顶字段，不改变零知识边界。
- 无需数据库迁移，兼容现有条目和旧备份。

### 验证

- 完整自动化测试 120/120 通过。
- Lint、TypeScript 类型检查、构建和发布资源检查通过。
- Cloudflare Worker + D1 与 Linux + SQLite 双运行时共享同一前端实现。

---

<a id="english"></a>
## English

### Added

- Accounts, websites, notes, and attachments can now be pinned or unpinned.
- The action is available from each row's More menu and from the detail header.
- Pinned records sort first within the active menu, group, search results, and attachment category filters.
- A compact pin badge is shown in lists, and the state persists across reloads and logins.

### Privacy and compatibility

- Pin state is encrypted in-browser with the record payload; the server still stores ciphertext only.
- No server-visible pin column is introduced, preserving the zero-knowledge boundary.
- No database migration is required; existing records and older backups remain compatible.

### Verification

- Full automated suite: 120/120 passed.
- Lint, TypeScript checks, build, and production asset checks passed.
- The same implementation supports Cloudflare Worker + D1 and Linux + SQLite.
