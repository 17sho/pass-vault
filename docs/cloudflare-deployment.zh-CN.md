# Cloudflare 部署指南（Workers + Static Assets + D1 + R2）

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [返回首页](../README.md)

本指南仅讲 Cloudflare 部署。请把 `<...>` 替换成实际值；真实账户 ID、D1 ID、token 和域名不要提交到公开仓库。

## 要求与架构

- Node.js 22+、npm、Git，以及启用 Workers/D1/R2 的 Cloudflare 账户。
- CLI 路线需要 Wrangler 登录；Dashboard 路线需要 GitHub 仓库连接或上传/构建能力。
- **v1.1.13 前置条件：** 准备一个 16–256 字符的强随机 `INVITE_CODE`，并确保 `apps/worker/migrations/0005_invite_attempts.sql` 在新代码发布前应用。缺少/无效配置会返回 `registration_unavailable`（HTTP 503），错误值返回 `invalid_invite`（HTTP 403）并计入持久限速；既有用户登录不受影响。

```text
浏览器 ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1: DB（密文元数据）
                       │                  └→ R2: ATTACHMENTS（密文对象）
                       └─ 其他   → Workers Static Assets (dist/)
```

首次操作前在仓库根目录运行：

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 1. Wrangler CLI 部署

### 1.1 登录、创建 D1、设置配置

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
npx wrangler r2 bucket create <R2_BUCKET_NAME>
```

复制返回的 `database_id`。编辑 `apps/worker/wrangler.jsonc`：

- `name` 改为 `<WORKER_NAME>`；
- `d1_databases` 中 binding 保持 `DB`，设置真实 `database_name`/`database_id`；
- `migrations_dir` 保持 `migrations`；
- `r2_buckets` 中 binding 必须为 `ATTACHMENTS`，并设置 `bucket_name`；
- Assets 目录保持 `../../dist`，`run_worker_first` 保持 `true`；
- 删除示例 route，或替换为自己的域名。公开分支应保留占位配置，实际值放在不提交的配置副本或 CI secrets 中。

### 1.2 migration、构建、发布

先在受控终端生成强随机值并直接送入 Wrangler。下面不会把值放进命令参数、环境变量或 shell 历史；不要开启 `set -x`，也不要把终端录屏/输出保存到工单：

```bash
# 仓库根目录；openssl rand 的 32 随机字节以 64 个十六进制字符表示
openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config apps/worker/wrangler.jsonc
```

Wrangler 应只确认 secret 名称/成功状态，不应回显值。若需人工保管同一个值，使用密码管理器自身的密码生成器（至少 128 bit 随机性、16–256 字符），再运行 `npx wrangler secret put INVITE_CODE --config apps/worker/wrangler.jsonc` 并在隐藏提示中粘贴；不要使用 `echo '真实值' | ...`、命令行参数或提交的 `.dev.vars`。

```bash
# apps/worker/
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
# 在输出中确认 0005_invite_attempts.sql 已 applied；未确认就停止，不要部署
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm run build
npx wrangler deploy --config apps/worker/wrangler.jsonc
npx wrangler versions list --config apps/worker/wrangler.jsonc
curl -fsS https://<WORKER_SUBDOMAIN>/api/health
```

每次 schema 变更只新增 migration，绝不重写已在远程执行的文件。

### 1.3 自定义域

在配置中添加（具体字段以当前 Wrangler schema 为准）：

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

重新部署；或在 Dashboard 的 Worker **Settings → Domains & Routes → Add → Custom Domain** 添加。等待 DNS/证书生效后验证主页与 `/api/health`。

## 2. Cloudflare Dashboard 部署

Dashboard 菜单名称可能调整；以当前界面为准。

1. **Storage & Databases → D1 → Create database**，创建 `<D1_DATABASE_NAME>`。
2. **Workers & Pages → Create → Import a repository**，连接 `<GITHUB_REPOSITORY>`，选择 `<PRODUCTION_BRANCH>`。
3. Root directory 设为仓库根目录；Build command 设为 `npm ci && npm run build`。
4. 这不是纯静态 Pages：必须部署 Worker API 并附加 Workers Static Assets。若界面支持 deploy command，设为 `npx wrangler deploy --config apps/worker/wrangler.jsonc`；若导入流程不能识别 Worker main/Assets/D1，请使用 Cloudflare CI/GitHub Actions 调 Wrangler，而不是发布成纯 Pages。
5. Worker **Settings → Bindings → Add → D1 database**：变量名必须为 `DB`，选择目标数据库。
6. 在 **Storage & Databases → R2 → Create bucket** 创建私有 bucket；Worker **Settings → Bindings → Add → R2 bucket**，变量名必须为 `ATTACHMENTS`。
7. 从受控终端运行 Wrangler migrations；**发布前必须确认 `0005_invite_attempts.sql` 已应用**。若使用 D1 Console，按文件名顺序执行所有尚未执行的 `apps/worker/migrations/*.sql`，再检查 `invite_attempts` 表；不要只上传新代码。
8. 在目标 Worker 的 **Settings → Variables and Secrets**（当前界面也可能归在 **Bindings** 或类似设置页）新增变量，名称严格为 `INVITE_CODE`，类型选择加密的 **Secret**，值由密码管理器生成（至少 128 bit 随机性，16–256 字符）。保存并按界面要求部署新版本。不要选明文变量，也不要把值放在构建变量、仓库或截图中。
9. 保存后回到变量/秘密列表，只核对名称 `INVITE_CODE`、Secret 类型和目标环境；Cloudflare 不应再次显示值。若界面没有 Secret 类型或目标环境不明确，停止并改用上面的 `wrangler secret put`，不要降级成明文。
10. 确认 Assets 指向构建出的 `dist/`，且 API 请求先经过 Worker。
11. **Settings → Domains & Routes**（或当前等价入口）添加 `<APP_DOMAIN>`，完成 DNS 和证书。
12. CI 中把最小权限 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 存为加密 secrets；不得写进仓库或日志。

## 3. 发布后验证

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
```

在浏览器用可清理测试账户验证：正确邀请码可注册；明显错误的占位值被拒绝且不创建账户；随后登录/解锁成功。不要通过 API、日志或截图打印真实邀请码。缺少/无效 `INVITE_CODE` 时注册应为 HTTP 503 `registration_unavailable`，错误值应为 HTTP 403 `invalid_invite`（连续失败可能变为 429），但既有账户仍应能登录。再验证 CSRF 拒绝、密文条目和附件上传/下载/删除、加密备份导入/导出与退出。R2 无需公开访问或公共域名，也无需 bucket CORS。

### 3.1 轮换与回退

轮换只影响**轮换后的新注册**，不会注销既有会话、改变主密码或重新加密已有库。先在安全渠道通知仍需注册的人，再用 Dashboard Secret 保存新值，或重复安全的 `openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config ...`；随后仅核对 secret 名称，并以可清理账户验收。不要保留两个有效值。

若轮换后注册异常，先确认值长度、目标 Worker/环境和当前部署版本。需要紧急回退时，从密码管理器取回前一个值，通过 Secret 输入界面或 Wrangler 隐藏提示重新写入；**不要**用 Worker 代码回滚代替 secret 回退。前值如果疑似泄露，不得回退，应生成新的强随机值。

## 4. 升级、备份、恢复与回滚

升级前停止写入，并在同一逻辑时间点备份 D1 与 R2。导出 D1，同时用受控工具或 Cloudflare API 将 R2 全量复制到独立的版本化 bucket，保留对象键、大小和校验信息；不要只备份 D1。

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm ci && npm test && npm run lint && npm run typecheck && npm run build
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

限制备份权限并异地保存。恢复时新建 D1 和 R2 bucket，导入 SQL、恢复全部对象并核对数量/大小，再将 `DB` 与 `ATTACHMENTS` binding 一起切换，之后才恢复写入：

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

代码回滚：

```bash
npx wrangler versions list --config apps/worker/wrangler.jsonc
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config apps/worker/wrangler.jsonc
```

**Worker 版本回滚不会回滚 D1 或 R2。** 对不兼容的 schema/对象变更，必须成对切换到同一备份点恢复的 D1 + R2，或使用经审查的前向修复。

## 5. 费用与限制

- **本部署所需的 Workers、Workers Static Assets、D1、R2 Standard、Cloudflare DNS/代理、通用 SSL 与基础 DDoS 防护都有免费层，不要求为了运行本项目升级 Pro 或 Workers Paid。** 但“产品有免费层”不等于“整个账户永远不会产生账单”：付费订阅、同账户其他项目及 R2 超额仍需在 Billing/Usage 中核对。
- Workers Free 的请求/CPU 配额以 Cloudflare 当前官方说明为准；达到 Free 限制时请求会受限。D1 Free 当前包含每天 5,000,000 行读取、100,000 行写入及账户总计 5 GB 存储；达到 Free 日限额时相关查询会失败，而不是由本项目自动升级付费计划。
- Cloudflare 当前 R2 Standard 免费额度为**整个账户合计**每月 10 GB-month 存储、1,000,000 次 Class A、10,000,000 次 Class B；不是每个 bucket 独享。官方 R2 Limits 将每 bucket 存储列为 Unlimited，未提供 bucket 原生硬消费/用量封顶。
- 本项目因此在 D1 中按 UTC 自然月、于 R2 操作前原子 reservation：密文字节 8 GiB、Class A 800,000/月、Class B 8,000,000/月。达到上限返回 `quota_exceeded`，失败的已尝试操作仍保守计数；删除对象按官方定价为免费操作，成功后释放存储 reservation。
- 20% 余量用于账户内其他用量及计量差异，但**不能保证零账单**：同账户其他 bucket、Dashboard、S3/API/其他 Worker 访问均绕过本应用计数；GB-month 也不是瞬时字节数。请同时检查账户级用量和账单。
- Cloudflare Budget Alert 是账户级美元支出通知，只告警、不停止消费；没有 R2 免费额度 80% 的产品级硬告警 API。不要把它当硬上限。
- 附件会产生 R2 存储与 Class A/B 操作，Worker 请求和 D1 查询分别计量；备份 bucket 也增加存储成本。
- 应用明文限制：图片 10 MiB、视频 100 MiB、其他文件 25 MiB；视频完整下载后在浏览器解密播放，不支持 Range 或断点续传。

### 免费部署检查清单

1. **Account → Billing → Subscriptions**：确认没有为了本项目启用 Workers Paid、Zone Pro、Argo、Images、Stream 等付费订阅。
2. **Account → Billing → Bills and documents**：确认没有待付账单。
3. **Storage & Databases → R2 → Overview/Usage**：检查整个账户（不是单 bucket）的存储、Class A、Class B 月度用量。
4. **D1 → 目标数据库 → Metrics → Row Metrics**：检查每日 rows read/written 与总存储。
5. **Workers & Pages → 目标 Worker → Metrics**：检查请求和 CPU 用量。

> 本项目的 8 GiB / 800,000 Class A / 8,000,000 Class B 限制只覆盖经此 Worker 发起的操作。Dashboard、S3 API、其他 Worker 或其他 bucket 不受它约束。Budget Alert 也只提醒，不会自动停止消费。

### Web Analytics 与密码库 CSP

Cloudflare Web Analytics 的 zone 级 `auto_install` 可能把 `static.cloudflareinsights.com/beacon.min.js` 自动注入密码库页面，与本项目严格的 `script-src 'self'` CSP 冲突。**不要为了统计脚本放宽 CSP，也不要把 Beacon 代码手动加入密码库。**

- 免费套餐若不提供按 hostname 排除规则，可在 **Analytics & Logs → Web Analytics → 站点 → Manage site → RUM** 选择 **Enable and install JS snippet / 启用并安装 JS 片段**，使 Cloudflare 停止自动注入；仅在其他非敏感站点手动安装代码。
- 若整个 zone 都不需要统计，可选择 Disable；不要为了一个子域名贸然删除或关闭仍被其他站点使用的统计。
- 更新后等待边缘配置传播，并在真实浏览器确认 DOM 不含 `data-cf-beacon`、控制台无 CSP violation。

## 6. 安全与故障排查

- Cloudflare 账户启用 MFA；API token 最小权限、定期轮换；保护 GitHub/CI。
- 生产仅 HTTPS；备份加密、限权、异地保存并演练恢复。
- 不记录或分享密码、vault key、条目明文、完整密文、Cookie/token。

| 症状 | 检查 |
|---|---|
| `DB` 未定义 | binding 名严格为 `DB`；当前环境/版本绑定到正确 D1 |
| 注册返回 503 `registration_unavailable` | `INVITE_CODE` 缺失、长度不在 16–256 或设置到了错误 Worker/环境；只核对 Secret 名称/类型，重新安全写入 |
| 正确值也返回 403/429 | 检查复制时的首尾空白/换行和目标环境；等待限速窗口后用可清理账户重试，勿在日志打印值 |
| `no such table` | migration 是否对 `--remote` 目标完整执行 |
| 静态 404/旧页面 | `npm run build`、Assets=`dist/`、部署版本和缓存 |
| Dashboard 只有静态站 | 改用 Worker + Assets 的 Wrangler/CI，不要用纯 Pages 代替 API |
| 登录后立即退出 | HTTPS、系统时钟、Cookie/域名是否一致 |
| 403/CSRF | 同源访问、Cookie 是否发送、自定义域是否一致 |
| 回滚后异常 | 代码与 D1 schema 兼容性；版本回滚不等于数据库回滚 |
