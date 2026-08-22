# PassVault v2.2.1

<a id="中文"></a>
[中文](#中文) · [English](#english)

> Cloudflare Worker / D1 / R2 与独立 Admin Worker 补丁发行版

## 中文

### 新增与改进

- 新增永久/限时用户封禁和解封；封禁会撤销已有会话，并在密码、Passkey、既有会话及附件补偿路径中 fail closed。
- 新增隐私聚合安全事件中心，可筛选、处理、忽略并记录非敏感备注。
- 新增页面通知及可选 Telegram 告警；服务端按小时去重和冷却，发送失败不影响业务。
- 新增 D1/R2 维护中心：扫描默认只读；修复要求精确确认、每批最多 20 项，并在入队前重新核验引用和 inflight 状态。
- 新增用户非敏感元数据 JSON/CSV 白名单导出，所有文本安全引用并防止 CSV 公式注入。
- 调整 Cloudflare 登录页文字层级：正文、输入和按钮为 16px，辅助提示与品牌眉题为 14px，改善中文可读性。

### 安全边界

- 安全事件和通知不返回主体哈希、IP、用户名、凭据、保险库内容、附件内容或 R2 object key。
- 截断或未完成的 R2 扫描 fail closed，不生成可修复报告；维护修复对当前附件、历史版本、分享、待删和 inflight 引用进行保护。
- Admin 写接口继续要求 Cloudflare Access、管理员邮箱白名单、同源和 JSON 校验；破坏性操作、维护修复和导出均写入审计。
- 公开包使用脱敏 Wrangler 模板，不包含生产域名、账号、资源 ID、数据库备份或凭据。

### 升级

1. 备份 D1，并确认无未归属的 R2 生命周期记录。
2. 按顺序应用全部待处理 D1 migrations，包括 `0034_admin_control_center.sql`。
3. 使用 `--keep-vars` 部署主 Worker。
4. 使用仓库外 Admin 严格 JSON 配置运行 `PASS_VAULT_ADMIN_PROD_CONFIG=/path/outside/repository/admin-prod.json npm run deploy:admin`。
5. 重新打开旧浏览器标签页，确保加载新 CSS。

本 Release **仅提供 Cloudflare 版压缩包**。本轮不会生成或上传 Linux 压缩包；共享前端文件仍兼容 Linux 构建，但 Linux 版未发布、未做生产验证。

---

<a id="english"></a>
## English

### Additions and Improvements

- Adds permanent/timed user suspension and unsuspension. Suspension revokes existing sessions and fails closed across password, Passkey, established-session, and attachment-compensation paths.
- Adds a privacy-aggregated Security Events Center with filtering, resolution, dismissal, and non-sensitive notes.
- Adds in-page notifications and optional Telegram alerts with server-side hourly deduplication/cooldown; delivery failures never fail business operations.
- Adds a D1/R2 Maintenance Center: scans are read-only by default; repair requires exact confirmation, processes at most 20 items per batch, and revalidates references/inflight state before enqueueing.
- Adds allowlisted JSON/CSV export of non-sensitive user metadata with safe quoting and spreadsheet-formula injection protection.
- Improves Cloudflare login typography: 16px body/input/action text and 14px helper/eyebrow text for clearer Chinese readability.

### Security Boundaries

- Security events and notifications never expose subject hashes, IPs, usernames, credentials, vault/attachment contents, or R2 object keys.
- Truncated/incomplete R2 scans fail closed and cannot become repairable reports. Repair protects current attachments, history, shares, pending deletions, and inflight references.
- Admin writes still require Cloudflare Access, the exact admin-email allowlist, same-origin validation, and JSON validation. Destructive actions, repair, and export are audited.
- Public archives use sanitized Wrangler templates and exclude production domains, accounts, resource IDs, database backups, and credentials.

### Upgrade

1. Back up D1 and confirm there are no unowned R2 lifecycle rows.
2. Apply every pending D1 migration in order, including `0034_admin_control_center.sql`.
3. Deploy the main Worker with `--keep-vars`.
4. Deploy Admin from an out-of-repository strict JSON config with `PASS_VAULT_ADMIN_PROD_CONFIG=/path/outside/repository/admin-prod.json npm run deploy:admin`.
5. Reopen old browser tabs so they load the new CSS.

This Release provides **Cloudflare archives only**. No Linux archive is generated or uploaded; shared frontend files remain compatible with the Linux build, but the Linux edition was not released or production-verified in this cycle.

## Verification / 校验

Verify downloads with `SHA256SUMS`. If PassVault helps you, a GitHub Star is appreciated.
