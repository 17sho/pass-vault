# Pass Vault V2 v1.1.20

## 中文

- 账号、网站、笔记和附件详情新增小型创建时间页脚，固定按北京时间显示。
- 条目创建时间由后端生成；后续编辑无法覆盖。旧条目以最后更新时间回填。
- Cloudflare 升级必须先应用 `0006_entries_created_at.sql`；Linux 在启动时自动执行幂等迁移。升级前请备份，暂勿清空或重建数据库。

## English

- Account, website, note, and attachment details now include a compact creation-time footer rendered in Beijing time.
- The backend generates entry creation timestamps and edits cannot overwrite them. Legacy entries are backfilled from their last-updated timestamp.
- Cloudflare upgrades must apply `0006_entries_created_at.sql` first; Linux performs the idempotent migration at startup. Back up before upgrading and do not clear or recreate the database.