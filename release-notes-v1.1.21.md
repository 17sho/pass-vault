# Pass Vault V2 v1.1.21

[跳转到 English](#english)

## 中文

### 修复

- 未填写“说明”、标签或其他可选文本字段时，详情页保持空白，不再显示破折号占位符。
- 空字段保留克制的 24px 留白，并将标签后的顶部间距调整为 8px。
- 删除任意账号、网站、笔记或附件后，剩余列表不再重复播放入场动画，避免列表抽搐。
- 前端资源缓存键更新至 v1.1.21，确保浏览器加载本次 JS/CSS。

### 验证

- 完整测试 115/115、Lint、Typecheck、Build 全部通过。
- Cloudflare Chromium 320px 与 Linux WebKit 390px 生产验证通过；空字段文字为空、最小高度 24px、顶部间距 8px且无横向溢出。
- 双端测试账号均已精确清理，残留为 0。

### 升级

- 从 v1.1.20 升级无需数据库迁移；重新部署对应运行时并刷新前端资源即可。
- Cloudflare 与 Linux 发行包互相独立，请选择对应运行时。

> 安全提醒：忘记主密码无法恢复库内数据。请保留加密备份并妥善保存主密码。

如果项目对你有帮助，欢迎在 [GitHub](https://github.com/17sho/pass-vault-v2) 点一个 Star，谢谢支持！

## English

### Fixed

- Empty descriptions, tags, and other optional text fields now remain blank in detail views instead of showing an em-dash placeholder.
- Empty fields retain a restrained 24px blank area with an 8px top gap after the label.
- Deleting an account, website, note, or attachment no longer replays the entrance animation on every remaining row, preventing list jitter.
- Frontend cache keys were bumped to v1.1.21 so browsers load the updated JavaScript and CSS.

### Verification

- The complete 115/115 test suite, lint, typecheck, and build passed.
- Production smoke passed on Cloudflare Chromium at 320px and Linux WebKit at 390px: empty text, 24px minimum height, 8px top gap, and no horizontal overflow.
- Disposable test users were precisely removed from both backends with zero residual accounts.

### Upgrade

- No database migration is required from v1.1.20; redeploy the appropriate runtime and refresh frontend assets.
- Cloudflare and Linux archives are separate; choose the package for your runtime.

> Security reminder: forgotten master passwords cannot be recovered. Keep an encrypted backup and store your master password safely.

If this project helps you, please consider giving it a Star on [GitHub](https://github.com/17sho/pass-vault-v2). Thank you!
