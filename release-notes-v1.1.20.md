# Pass Vault V2 v1.1.20

## 中文

- 账号、网站、笔记和附件详情新增小型创建时间页脚，固定按北京时间显示。
- 条目创建时间由后端生成；后续编辑无法覆盖。旧条目以最后更新时间回填。
- Cloudflare 升级必须先应用 `0006_entries_created_at.sql`；Linux 在启动时自动执行幂等迁移。升级前请备份，暂勿清空或重建数据库。
- 已通过完整 114/114 测试，并在 Cloudflare Chromium 320px 与 Linux WebKit 390px 完成生产 Smoke；测试账号、条目和附件已精确清理为 0。

> 安全提醒：忘记主密码无法恢复库密钥。Cloudflare D1/R2 与服务器资源可能产生费用。若这个项目对你有帮助，欢迎在 GitHub 点一个 Star。

[跳转到 English](#english)

## English

- Account, website, note, and attachment details now include a compact creation-time footer rendered in Beijing time.
- The backend generates entry creation timestamps and edits cannot overwrite them. Legacy entries are backfilled from their last-updated timestamp.
- Cloudflare upgrades must apply `0006_entries_created_at.sql` first; Linux performs the idempotent migration at startup. Back up before upgrading and do not clear or recreate the database.
- The complete 114/114 suite passed, followed by production smoke tests on Cloudflare Chromium at 320px and Linux WebKit at 390px. Disposable users, entries, and attachments were precisely cleaned to zero.

> Security: a forgotten master password cannot recover the vault key. Cloudflare D1/R2 and server resources may incur charges. If this project helps you, a GitHub Star is warmly appreciated.