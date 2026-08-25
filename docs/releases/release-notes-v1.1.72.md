# v1.1.72 — 原子并发与附件补偿加固 / Atomic concurrency and attachment compensation hardening

[中文](#中文) · [English](#english)

## 中文

本 Release 对应 tag `v1.1.72`，包含分别面向 Cloudflare 与 Linux 的独立制品。它不会移动或覆盖历史 `v1.1.71` tag 与资产。

### 一致性与可靠性

- 条目和附件新增服务端 revision CAS，过期写入返回冲突，避免并发页面静默覆盖新数据。
- 删除后保留 revision tombstone，避免旧页面在删除后重新创建已删除对象。
- Cloudflare D1 与 Linux SQLite 分别使用原子条件写入；Cloudflare迁移链新增 `0014`–`0016`。
- 备份导入锁增加续租、所有权校验和 fencing；成功及显式错误响应都会先释放锁再返回客户端。
- Linux附件删除使用持久化outbox；进程异常后可继续重试，避免数据库记录与文件对象长期分叉。

### 会话与附件安全

- 上传、重命名、删除与失败补偿均绑定操作开始时捕获的会话、CSRF、revision和vault key。
- 锁库或切换账户后的迟到响应不得写入新会话；跨账户补偿使用严格限权的旧会话端点。
- Cloudflare在R2写入后失锁、D1写入失败等路径执行精确补偿，并保持存储预留与pending删除账本一致。
- 密码库业务字段、附件metadata与内容仍为客户端加密；服务端revision不包含明文业务数据。

### 验证与生产状态

- 最终完整串行门禁：`359/359`通过，0失败、0跳过，自然exit 0。
- Lint、文档检查、TypeScript、Build、Node语法、`public/`与`dist/`一致性及三路独立审查通过。
- 发布候选完成串行门禁与双端独立审查；Cloudflare已应用`0014`–`0016`并100%切流；Linux已使用不可变版本目录原子部署。
- Cloudflare Chromium与Linux WebKit生产烟测均为7个检查点、0错误；临时账户、子记录及附件对象已精确清理。

### 升级建议

- 建议所有旧版本直接升级到`v1.1.72`；不要只复制前端文件而跳过后端和迁移。
- Cloudflare升级前同点备份D1/R2，保留bindings、routes、vars、Secrets和Cron，然后应用完整migration链至`0016`。
- Linux升级前一致性备份SQLite与附件目录，使用新的不可变版本目录和原子软链切换。
- 两端不共享在线账户、会话、数据库或附件，不会自动同步生产数据。
- 可选服务器辅助Passkey会改变默认零知识边界；主密码仍不上传，但服务器KEK与通过用户验证的Passkey流程可恢复vault key。请阅读部署文档中的完整披露。

### 下载与校验

```bash
VERSION=1.1.72
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
# 下载与部署目标匹配的tar.gz或zip后：
sha256sum -c SHA256SUMS
```

如果项目对你有帮助，欢迎点一个Star ⭐️。问题和改进建议可通过Issues提交；安全漏洞请使用[GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new)私下报告。

## English

This Release corresponds to tag `v1.1.72` and provides separate artifacts for Cloudflare and Linux. It does not move or overwrite the historical `v1.1.71` tag or assets.

### Consistency and reliability

- Entries and attachments now use server-side revision CAS. Stale writes return conflicts instead of silently overwriting newer data.
- Revision tombstones survive deletion so an old page cannot recreate an object after it was deleted.
- Cloudflare D1 and Linux SQLite use atomic conditional writes; Cloudflare adds migrations `0014`–`0016`.
- Backup-import locks now use renewal, ownership checks, and fencing. Success and explicit error responses release the lock before replying to the client.
- Linux attachment deletion uses a durable outbox so cleanup can resume after a process interruption.

### Session and attachment security

- Upload, rename, delete, and failure compensation are bound to the initiating session, CSRF token, revision, and vault key.
- Late responses after lock or account switch cannot write through a new session. Cross-account cleanup uses a narrowly authorized endpoint tied to the old session.
- Cloudflare performs exact compensation after R2-write lock loss or D1 failure while keeping storage reservations and pending-deletion accounting consistent.
- Vault business fields, attachment metadata, and content remain client-encrypted. Server revisions do not contain plaintext business data.

### Verification and production status

- Final serialized gate: `359/359` passed, 0 failed, 0 skipped, natural exit 0.
- Lint, documentation checks, TypeScript, build, Node syntax, `public/`/`dist/` parity, and three independent reviews passed.
- The release candidate completed its serialized gate and independent reviews for both runtimes. Cloudflare applied migrations `0014`–`0016` and shifted 100% traffic; Linux deployed through a new immutable version directory.
- Cloudflare Chromium and Linux WebKit production smoke tests each passed seven checkpoints with zero errors. Temporary principals, child rows, and attachment objects were removed exactly.

### Upgrade guidance

- All earlier versions should upgrade directly to `v1.1.72`. Do not copy only frontend files while skipping backend code and migrations.
- Before Cloudflare upgrades, take a consistent D1/R2 backup, preserve bindings, routes, vars, Secrets, and Cron, then apply the complete migration chain through `0016`.
- Before Linux upgrades, take a consistent SQLite and attachment-directory backup and switch through a new immutable release directory.
- The two runtimes do not share hosted accounts, sessions, databases, or attachments and do not synchronize production data automatically.
- Optional server-assisted Passkey changes the default zero-knowledge boundary. The master password is still never uploaded, but the server KEK plus a user-verified Passkey flow can recover the vault key. Read the full disclosure in the deployment guides.

### Download and verify

```bash
VERSION=1.1.72
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
# After downloading the tar.gz or zip for your target:
sha256sum -c SHA256SUMS
```

If this project is useful, a Star ⭐️ is appreciated. Issues and improvements are welcome; report vulnerabilities through [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new), not public disclosure.
