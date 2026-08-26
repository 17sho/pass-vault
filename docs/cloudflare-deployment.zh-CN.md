# Cloudflare 完整部署指南（Workers + Static Assets + D1 + R2）

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [返回首页](../README.md)

本指南覆盖当前 `main` 的首次部署、生产升级、备份、恢复、回滚和验收。请把所有 `<...>` 替换为自己的值；不得把真实域名、账户/数据库 ID、bucket 名、token、邀请码、KEK、生产备份或私有配置提交到公开仓库。

> **版本说明：** GitHub `v2.2.3` Cloudflare 制品包含该 tag 截止的完整代码及 `0011`–`0013` R2 生命周期修复及 `0014`–`0016` revision CAS/tombstone 迁移。

## 1. 架构、要求与安全边界

```text
浏览器 ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1 binding: DB（认证材料和密文元数据）
                       │                  └→ R2 binding: ATTACHMENTS（附件密文对象）
                       └─ 其他   → Workers Static Assets binding: ASSETS（dist/）
                                      ↑
                         Cron 17 * * * *：有界对账/清理
```

要求：

- Node.js 22+、npm、Git，以及启用 Workers、D1、R2 的 Cloudflare 账户；
- Wrangler 4.x（仓库锁定版本通过 `npm ci` 安装）；
- 一个强随机、16–256字符的 `INVITE_CODE`；
- 附件功能必须使用私有R2 bucket，不需要公共访问、自定义R2域名或CORS；
- 生产只允许HTTPS。

默认模式下，Worker不持有可独立恢复vault key的服务器密钥。可选的服务器辅助Passkey会在D1保存由独立KEK加密包装的vault key；通过WebAuthn用户验证后，Worker可以恢复vault key并创建会话，因此**改变默认零知识边界**。Worker仍不接收主密码，也不保存明文vault key。启用前应理解这一风险。

## 2. 获取代码与本地门禁

### 2.1 推荐：从当前 `main` 部署

```bash
git clone https://github.com/17sho/pass-vault-v2.git
cd pass-vault-v2
git checkout main
git pull --ff-only
# 记录并审核实际提交；生产证据只记录SHA，不记录任何秘密
git rev-parse HEAD
npm ci
npm test
npm run lint
npm run lint:docs
npm run typecheck
npm run build
```

所有命令必须自然退出0。不要用被中止、超时或旧提交的测试结果代替当前门禁。

### 2.2 v2.2.3 Cloudflare 制品

本Release的Cloudflare资产包括：

- `pass-vault-v2-cloudflare-2.2.3.tar.gz`
- `pass-vault-v2-cloudflare-2.2.3.zip`
- `SHA256SUMS`

```bash
VERSION=2.2.3
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/pass-vault-v2-cloudflare-$VERSION.tar.gz"
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
grep "pass-vault-v2-cloudflare-$VERSION.tar.gz" SHA256SUMS | sha256sum -c -
```

校验必须显示`OK`。该包包含v2.2.3 tag截止的完整Cloudflare代码；升级后仍须核对并应用全部迁移。

## 3. 配置模型：公共模板与生产私有配置

`apps/worker/wrangler.jsonc`是公开模板，故意使用占位D1/R2资源且`workers_dev:true`，以便没有自定义域的新部署仍有目标。**不要把生产ID、bucket、域名或变量写回公共模板。**

生产应复制到仓库外或被 `.gitignore` 排除的位置，例如：

```bash
umask 077
install -m 0600 apps/worker/wrangler.jsonc <SAFE_CONFIG_DIR>/wrangler.production.jsonc
```

生产私有配置至少应完整包含：

```jsonc
{
  "$schema": "<ABSOLUTE_REPOSITORY_PATH>/node_modules/wrangler/config-schema.json",
  "name": "<WORKER_NAME>",
  "workers_dev": false,
  "main": "<ABSOLUTE_REPOSITORY_PATH>/apps/worker/src/index.ts",
  "compatibility_date": "2026-07-11",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "PASSKEY_RP_ID": "<APP_DOMAIN>",
    "PASSKEY_ORIGIN": "https://<APP_DOMAIN>"
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "<D1_DATABASE_NAME>",
    "database_id": "<D1_DATABASE_ID>",
    "migrations_dir": "<ABSOLUTE_REPOSITORY_PATH>/apps/worker/migrations"
  }],
  "r2_buckets": [{
    "binding": "ATTACHMENTS",
    "bucket_name": "<R2_BUCKET_NAME>"
  }],
  "assets": {
    "directory": "<ABSOLUTE_REPOSITORY_PATH>/dist",
    "binding": "ASSETS",
    "run_worker_first": true
  },
  "routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }],
  "triggers": { "crons": ["17 * * * *"] },
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

若私有配置放在仓库外，`main`、`assets.directory`和`migrations_dir`应使用绝对路径；相对路径按**配置文件所在目录**解析，可能错误指向`/tmp/migrations`等位置。

### 3.1 必需绑定与配置

| 类型 | 名称 | 要求 |
|---|---|---|
| Secret | `INVITE_CODE` | 必填，16–256字符；缺失/无效时新注册返回503，但既有登录不受影响 |
| Secret | `PASSKEY_UNLOCK_KEK` | 启用服务器辅助Passkey时必填；32随机字节的Base64URL；不能盲目轮换 |
| Plain var | `PASSKEY_RP_ID` | 启用Passkey时为精确HTTPS主机名，如`<APP_DOMAIN>` |
| Plain var | `PASSKEY_ORIGIN` | 启用Passkey时为`https://<APP_DOMAIN>`，无路径和尾斜杠 |
| D1 | `DB` | 必须绑定到目标数据库 |
| R2 | `ATTACHMENTS` | 必须绑定到私有附件bucket |
| Assets | `ASSETS` | `dist/`，且`run_worker_first:true` |
| Cron | `17 * * * *` | 负责R2 inventory、待删队列、崩溃遗留in-flight/锁和过期会话维护 |

三项Passkey配置必须同时有效，否则只关闭服务器辅助Passkey，主密码登录仍可用。**不得替换已有`PASSKEY_UNLOCK_KEK`**；丢失或替换会使已注册的辅助Passkey包装材料不可用。

## 4. 首次CLI部署

### 4.1 登录并创建资源

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 create <D1_DATABASE_NAME>
npx wrangler r2 bucket create <R2_BUCKET_NAME>
```

把返回的资源信息只写入生产私有配置。binding名称必须保持`DB`、`ATTACHMENTS`、`ASSETS`。

### 4.2 安全写入Secrets

```bash
openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config <PRODUCTION_CONFIG>
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' | \
  npx wrangler secret put PASSKEY_UNLOCK_KEK --config <PRODUCTION_CONFIG>
```

不要开启`set -x`，不要用`echo '真实值'`，不要把值放进参数、仓库、工单、截图或日志。若需要可恢复的固定值，在密码管理器生成/保存，再通过Wrangler隐藏提示输入。

启用Admin创建邀请码时，`INVITE_CODE_PEPPER`是两个Worker共享的必需Secret。主Worker和Admin Worker必须配置**完全相同的值**；验证时只确认两个Worker均存在该Secret名称，绝不输出其值。两端不一致会导致新邀请码无法验证。

### 4.3 应用完整迁移链

迁移账本位于`apps/worker/migrations/`。当前`main`首次部署应按账本应用`0001`到`0034`（包含`0034_admin_control_center.sql`）；升级只应用待执行项：

```bash
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
```

最后一条必须显示无待执行迁移。每次schema变更只新增migration，绝不重写已远程执行的文件。当前关键迁移包括：

- `0008_session_metadata.sql`：会话设备/活动元数据；
- `0009_passkey_assisted_unlock.sql`：辅助Passkey凭据、challenge和限流槽；
- `0010_session_auth_method.sql`：会话认证方式；
- `0011_r2_cleanup_queue.sql`：持久R2待删队列和物理配额；
- `0012_backup_import_locks.sql`：用户级备份导入锁；
- `0013_r2_inflight_uploads.sql`：R2写入前持久in-flight fencing。
- `0014_entries_revision.sql`：条目乐观并发revision；
- `0015_attachments_revision.sql`：附件乐观并发revision；
- `0016_revision_tombstones.sql`：删除/恢复后保持revision单调递增，防止ABA；
- `0027_reset_user_quota_audit.sql`：在配额结构升级后重置旧配额审计状态；
- `0028_admin_quota_history_index.sql`：增加Admin配额历史查询索引；
- `0029_f3_r2_consistency.sql`：回填R2生命周期归属、重建带用户归属的历史清理触发器，并增加维护/备份租约；
- `0034_admin_control_center.sql`：扩展管理员审计与安全事件约束，增加用户封禁、通知、维护报告和候选项表。此迁移必须先于主 Worker 与 Admin Worker 新代码部署。

### 4.4 Dry-run与部署

```bash
npm run build
npx wrangler deploy --dry-run --config <PRODUCTION_CONFIG>
npx wrangler deploy --config <PRODUCTION_CONFIG>
npx wrangler deployments status --config <PRODUCTION_CONFIG>
npx wrangler versions list --config <PRODUCTION_CONFIG>
```

只有最新版本100%承载流量才算完成。上传version不等于切流成功。

## 5. 生产升级：必须保留完整现网配置

> **关键规则：Wrangler部署不会因新代码自动保留普通`vars`。** 默认部署会删除旧普通变量，再设置配置文件中的`vars`；Secrets不会因普通deploy自动删除。Cloudflare官方`--keep-vars`可保留Dashboard管理的普通变量，但不能替代对bindings、routes、triggers、compatibility和`workers_dev`的完整审计。

### 5.1 升级前冻结基线

在任何部署前记录**任务开始前**版本ID，并保存只含名称/类型、不含秘密值的配置清单：

```bash
npx wrangler deployments status --config <PRODUCTION_CONFIG>
npx wrangler versions view <PRE_TASK_VERSION_ID> --json --config <PRODUCTION_CONFIG> > <SAFE_EVIDENCE>/before-version.json
npx wrangler secret list --config <PRODUCTION_CONFIG> > <SAFE_EVIDENCE>/before-secret-names.json
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
```

逐项比对并保留：

- 所有普通变量名和值来源；
- 所有Secret名称（只核对名称，不读取值）；
- `DB`、`ATTACHMENTS`、`ASSETS`绑定及目标；
- `compatibility_date`和flags；
- custom domain/routes；
- Cron triggers；
- `workers_dev`期望状态；
- observability设置。

**不能拿本次任务中间部署的版本当旧基线。** 如果无法确认现网值，停止部署并先从Dashboard/受限配置恢复清单。

若普通变量由Dashboard管理且不准备写入配置，可显式使用：

```bash
npx wrangler deploy --keep-vars --config <PRODUCTION_CONFIG>
```

但本项目更推荐把非秘密的`PASSKEY_RP_ID`和`PASSKEY_ORIGIN`写入受限生产配置，使部署可重复。无论是否使用`--keep-vars`，都必须核对其他绑定和路由。

### 5.2 一致性备份

升级前停止或隔离写入，在同一逻辑时间点备份D1与R2：

```bash
npx wrangler d1 export <D1_DATABASE_NAME> --remote \
  --output=<SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql \
  --config <PRODUCTION_CONFIG>
sha256sum <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql > <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql.sha256
chmod 0600 <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql*
```

同时用受控工具/API将R2全部对象复制到独立、版本化备份bucket，保留对象key、大小和校验信息。**不能只备份D1或只备份R2。** 备份目录应位于仓库外、权限受限并异地保存。

### 5.3 升级顺序

1. 记录任务开始前版本和完整配置清单；
2. 生成并验证D1＋R2同点备份；
3. `npm ci`并完成全部门禁；
4. 用生产私有配置执行deploy dry-run；
5. 应用全部待执行migration并再次确认无pending；
6. 部署Worker和Assets；
7. 确认新版本100%切流；
8. 对比新旧配置项，任何非预期删除都立即阻断；
9. 完成第7节验收后才结束维护窗口。

## 6. Dashboard / CI部署

Dashboard菜单会变化，但必须建立与CLI相同的最终状态：

1. 创建/选择D1和私有R2；
2. Worker绑定`DB`、`ATTACHMENTS`、`ASSETS`；
3. Root为仓库根目录，build为`npm ci && npm run build`；
4. 必须部署Worker API＋Workers Static Assets，不能发布成纯Pages；
5. 以Secret保存`INVITE_CODE`和`PASSKEY_UNLOCK_KEK`；
6. 以普通变量保存`PASSKEY_RP_ID`和`PASSKEY_ORIGIN`；
7. 添加`17 * * * *` Cron Trigger；
8. 添加精确custom domain；若生产不需要公开子域，关闭`workers.dev`；
9. 部署前从受控终端应用全部D1迁移；
10. CI中的API token和account ID只能放加密CI secrets，并使用最小权限；
11. 每次升级前导出/比对Dashboard中全部变量、Secrets名称、bindings、routes和triggers，不能只看代码diff。

## 7. 发布后完整验收

### 7.1 匿名与配置验收

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
curl -fsS -o /dev/null -w '%{http_code}\n' https://<WORKER_SUBDOMAIN>.workers.dev/api/health
```

预期：正式域健康200；若生产设置`workers_dev:false`，实际workers.dev入口应404。再检查：

- 当前deployment只有目标版本承载100%流量；
- 新版本仍有`INVITE_CODE`、`PASSKEY_UNLOCK_KEK`两个Secret名称；
- 新版本有`PASSKEY_RP_ID`、`PASSKEY_ORIGIN`普通变量；
- D1/R2/Assets绑定、custom domain、Cron和compatibility未丢失；
- 首页、`app.mjs`、`style.css`等固定资源与本地`dist/`哈希一致；
- 安全头存在，DOM未被Cloudflare Web Analytics自动注入脚本。

Passkey服务端探针可以匿名请求authentication options：正确配置应返回WebAuthn challenge，而不是503 `passkey_unlock_unavailable`。该探针会产生短期challenge/限流记录；使用可识别测试来源并按精确范围清理，不能宽泛删除生产数据。

### 7.2 真实浏览器与可清理账户

只有拥有合法邀请码和可清理测试账户时才执行：

1. 正确邀请码注册；明显错误值返回403 `invalid_invite`且不创建用户；缺失/无效服务端配置返回503 `registration_unavailable`；
2. 主密码登录/解锁、条目增删改；
3. 附件上传、下载、替换、删除；
4. 仅资料备份和完整备份导出/导入；
5. 安全中心显示认证方式和会话；
6. 注册服务器辅助Passkey，锁定后在真实设备完成Passkey免主密码解锁，再撤销验证；
7. 退出后会话失效；
8. 删除测试条目、附件、会话、Passkey和测试账户，复核无残留。

没有合法邀请码或真实设备时不得伪造成功。服务端返回challenge只证明配置恢复，**不等于已有Passkey真实解锁完成**。

### 7.3 D1/R2对账

至少核对：

- `attachments`引用数、对象key和`ciphertext_size`；
- R2对象数、key和size；
- D1缺失对象=0、R2孤儿=0、大小不匹配=0；
- `pending_r2_deletions=0`；
- `r2_inflight_uploads=0`；
- `backup_import_locks=0`；
- `r2_storage_usage.reserved_bytes`不得小于Worker管理的物理对象字节。

少量保守计数余量不等于R2孤儿；应分别报告“物理对象差集”和“配额计数”。Cron会进行有界inventory，但不能替代发布后的人工只读对账。

## 8. R2生命周期、Cron与限制

- 普通删除先在D1原子移除引用并登记pending，R2实际删除成功后才释放物理字节配额；
- R2写入前登记`r2_inflight_uploads`，D1有效引用提交与移除in-flight在同一事务完成；
- 完整备份导入使用用户级token fencing，防止旧请求或v1/v2并发覆盖；
- Cron每小时分页对账`attachments + pending + inflight`与R2 inventory；物理删除前再次检查有效引用；
- 活跃完整导入会在每次R2上传前后按token续租10分钟；新导入可原子接管已过期租约，定时维护则另行回收超过24小时的崩溃遗留in-flight和锁记录；
- 固定时间宽限本身不能证明上传结束，不能删除`0013`或停用Cron后仍宣称竞态安全。

Cloudflare应用限制：图片、视频及其他附件均最大20 MiB；一次完整备份中的附件密文总计最大20 MiB。R2应用级保守硬限制为8 GiB存储、每月800,000 Class A、8,000,000 Class B。它只覆盖经此Worker发起的操作；Dashboard、S3 API、其他Worker和同账户其他bucket会绕过应用计数。

## 9. 费用与账户级检查

Workers、Static Assets、D1、R2 Standard、DNS/SSL均有免费层，但不能保证整个账户零账单：

1. Billing → Subscriptions：确认没有意外启用付费产品；
2. Bills and documents：确认无待付账单；
3. R2 Overview/Usage：检查账户级存储和Class A/B；
4. D1 Metrics：检查rows read/written和存储；
5. Worker Metrics：检查请求和CPU。

Cloudflare Budget Alert只告警、不停止消费。R2免费额度是账户共享，不是每bucket独享。

## 10. 恢复与回滚

代码回滚：

```bash
npx wrangler versions list --config <PRODUCTION_CONFIG>
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config <PRODUCTION_CONFIG>
```

**Worker回滚不会回滚D1、R2、普通变量或外部资源。** 回滚后必须重新核对Passkey变量、Secrets名称、bindings、routes、Cron和`workers_dev`。

数据恢复应新建D1和R2，从同一备份点导入SQL和全部对象，核对key/数量/大小后同时切换`DB`与`ATTACHMENTS`。不要把旧D1与新R2混搭，也不要直接覆盖仍在写入的生产资源。只有在完整验收后才恢复写入并清理故障现场副本。

## 11. Web Analytics、CSP与故障排查

Cloudflare Web Analytics的`auto_install`可能注入`static.cloudflareinsights.com/beacon.min.js`并违反本项目严格CSP。不要放宽`script-src 'self'`。为该敏感子域关闭自动注入，或改成仅在其他非敏感站点手动安装snippet；在真实浏览器确认DOM无`data-cf-beacon`且控制台无CSP错误。

| 症状 | 重点检查 |
|---|---|
| Passkey提示“未启用” | 三项Passkey配置是否同时存在；部署是否因缺少`vars`覆盖了RP ID/Origin；精确Origin是否一致 |
| 注册503 `registration_unavailable` | `INVITE_CODE` Secret名称/目标环境/长度；不要打印值 |
| 正确邀请码403/429 | 不可见空白、目标环境和限流窗口 |
| `no such table`或`no such column: revision` | 是否对正确remote D1完整应用`0001`–`0029` |
| 附件/备份500或缺表 | 完整`0001`–`0029`、R2 binding、Cron和当前版本是否一致 |
| 静态404/旧页面 | Assets路径、build、100%切流、边缘缓存和资源哈希 |
| workers.dev意外可访问 | 生产私有配置`workers_dev:false`是否被公共模板覆盖 |
| Cron不存在 | `triggers.crons`是否在生产配置和当前version中 |
| 回滚后异常 | 代码/schema/配置版本是否配套；代码回滚不等于数据/变量回滚 |

## 12. 最终发布清单

- [ ] 记录任务开始前版本与完整配置清单
- [ ] D1＋R2同点备份、校验、限权、仓库外保存
- [ ] 当前提交的test/lint/docs/typecheck/build全部自然exit 0
- [ ] 生产私有配置包含全部vars、bindings、routes、Cron、compatibility和期望`workers_dev`
- [ ] Secrets名称完整，真实值不进入Git/日志
- [ ] 全部待执行migration已应用，复核无pending
- [ ] dry-run通过，正式版本100%切流
- [ ] 正式域200，期望关闭时workers.dev为404
- [ ] Passkey options正常，真实设备Passkey解锁按条件验收
- [ ] D1/R2对象差集和临时表均正常
- [ ] 测试账户和探针数据精确清理
- [ ] Git diff与提交秘密扫描通过

完成以上全部项目后，才能宣称生产Cloudflare部署闭环。