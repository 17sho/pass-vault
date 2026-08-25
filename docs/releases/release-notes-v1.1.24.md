# Pass Vault V2 v1.1.24

[跳转到 English](#english)

## 中文

### 修复

- 修复从当前分类新建另一类型资料后，实际列表已经切换但顶部分类菜单仍停留在旧类型的问题。
- 保存成功后，顶部分类菜单、实际列表、搜索条件和详情状态现在会原子同步到新资料所属分类。
- 例如：当前在“笔记”中新建“账号”后，顶部“账号”会立即高亮，并显示新建账号列表。
- 前端资源缓存键更新至 `1.1.24`，避免浏览器复用旧脚本。

### 验证

- 完整自动化测试：117/117 通过。
- Lint、Typecheck、Build 通过。
- Cloudflare Chromium 320px 与 Linux WebKit 390px 生产 Smoke 通过。
- 两端确认账号菜单 `aria-current=page`、笔记菜单 `aria-current=false`，新账号可见且无横向溢出。

---

<a id="english"></a>
## English

### Fixed

- Fixed category desynchronization after creating an item of a different type: the list switched to the new type while the top navigation still highlighted the previous category.
- After a successful save, the top category navigation, visible list, search state, and detail state now switch atomically to the created item's category.
- For example, creating an Account while viewing Notes now immediately highlights Accounts and displays the newly created account.
- Bumped the frontend cache key to `1.1.24` so browsers do not reuse the old script.

### Verification

- Full automated suite: 117/117 passed.
- Lint, typecheck, and build passed.
- Production smoke passed on Cloudflare Chromium at 320px and Linux WebKit at 390px.
- Both deployments reported `aria-current=page` for Accounts, `aria-current=false` for Notes, the new account visible, and no horizontal overflow.
