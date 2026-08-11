# 生产部署、验证与回滚（维护者入口）

> 公开部署者应使用完整的 [Cloudflare中文](cloudflare-deployment.zh-CN.md) / [English](cloudflare-deployment.en.md) 或 [Linux中文](server-deployment.zh-CN.md) / [English](server-deployment.en.md) 指南。本页是维护者门禁摘要，不包含真实域名、资源ID或秘密快捷方式。

Pass Vault V2有两个独立后端：

- Cloudflare：Worker + Static Assets + D1 + R2；
- Linux：Node.js + SQLite + 本地附件目录。

两端账户和数据不自动同步。任何发布只能操作明确授权的目标，不能把D1与SQLite当作主从，也不能把一端的限制或配置套到另一端。

## 1. 共同发布门禁

```bash
npm ci
npm test
npm run lint
npm run lint:docs
npm run typecheck
npm run build
git diff --check
```

所有门禁必须基于待发布提交并自然exit 0。被中止、超时、环境损坏或被后续修复取代的轮次不算有效证据。纯Markdown修改无需重发运行时，但仍须执行文档、链接、敏感信息和打包检查。

发布证据只能记录：时间、目标类型、commit/version、布尔结果、脱敏错误。不得记录域名、账户/数据库ID、bucket、邀请码、KEK、Cookie、用户资料、密文正文或生产配置。

## 2. 版本与Release资产真实性

- 当前`v2.1.0` Release提供隔离的Cloudflare与Linux tar/zip及`SHA256SUMS`，并包含截至tag的`0011`–`0013` R2生命周期修复及`0014`–`0016` revision CAS/tombstone迁移。
- Linux可使用v2.1.0 Linux制品，或从同一tag/已审核main提交构建。
- 不移动旧tag、不替换Release资产、不在文档中提供不存在的下载文件名。
- 新部署和生产升级优先使用当前`main`的明确commit SHA，并在部署前审核diff。

## 3. Cloudflare发布

### 3.1 发布前基线和配置保留

在任何部署前记录**任务开始前**活动version，而不是本任务中间version。保存不含秘密值的名称/类型清单并逐项比对：

- Plain vars：`PASSKEY_RP_ID`、`PASSKEY_ORIGIN`及任何现网新增变量；
- Secrets名称：`INVITE_CODE`、`PASSKEY_UNLOCK_KEK`；
- bindings：`DB`、`ATTACHMENTS`、`ASSETS`及真实目标；
- compatibility date/flags；
- custom-domain routes；
- Cron `17 * * * *`；
- `workers_dev`期望状态；
- observability。

Wrangler普通deploy默认删除旧plain vars后只写配置中的`vars`；Secrets不会被普通deploy删除。Dashboard管理plain vars时可显式使用`--keep-vars`，但它不能保留/验证其他bindings、routes或triggers。生产必须使用仓库外或gitignored的受限配置；配置在仓库外时，`main`、Assets和`migrations_dir`使用绝对路径。

### 3.2 同点备份和迁移

停止或隔离写入，在同一逻辑时间点：

1. 导出D1，计算SHA-256并设为0600；
2. 复制全部R2对象到独立版本化备份bucket，保存key/size/checksum清单；
3. 把备份放在仓库外并异地保存；
4. 运行`d1 migrations list`；
5. 按账本应用全部待执行迁移，当前`main`完整链至`0016_revision_tombstones.sql`；
6. 再次list并确认无pending。

不能只备份D1，不能跳过R2，也不能重写已执行migration。

### 3.3 Dry-run、部署和切流

```bash
npx wrangler deploy --dry-run --config <PRODUCTION_CONFIG>
npx wrangler deploy --config <PRODUCTION_CONFIG>
npx wrangler deployments status --config <PRODUCTION_CONFIG>
npx wrangler versions list --config <PRODUCTION_CONFIG>
```

必须确认目标version承载100%流量；上传version不等于部署完成。部署后重新读取当前version的vars/bindings/routes/triggers，与任务前基线比较，任何非预期删除均阻断。

### 3.4 Cloudflare验收

- 自定义域主页和`/api/health`为200；
- 生产要求关闭时，实际workers.dev入口为404；
- 静态资源与本地`dist/`哈希一致，安全头正常；
- Passkey authentication options返回WebAuthn challenge，不是`passkey_unlock_unavailable`；
- 有真实设备和合法测试账户时，完成已有Passkey免主密码解锁；仅返回challenge不算完整解锁；
- D1与R2按对象key/size对账：缺失0、孤儿0、大小不匹配0；
- `pending_r2_deletions`、`r2_inflight_uploads`、`backup_import_locks`无异常积压；
- 测试账户、challenge、限流槽和附件按精确范围清理；
- Cron和`workers_dev`状态符合生产预期。

### 3.5 Cloudflare回滚

```bash
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config <PRODUCTION_CONFIG>
```

代码回滚不会回滚D1、R2、plain vars或外部资源。回滚后重新核对Passkey变量、Secret名称、bindings、routes、Cron和`workers_dev`。不兼容数据恢复必须将同一备份点的新D1与新R2一起切换，不能覆盖仍在写入的生产资源。

## 4. Linux发布

### 4.1 发布前

- 记录`readlink -f /opt/pass-vault-v2/current`和当前commit/version；
- 生成仅含名称的环境变量清单，保留`INVITE_CODE`、原`PASSKEY_UNLOCK_KEK`、RP ID/Origin、数据库/附件路径和`CLIENT_IP_HEADER`；
- 停止服务后用SQLite `.backup`和附件tar生成同点备份并验证完整性；
- 使用v2.1.0 Linux制品或从审核过的明确commit构建到新不可变版本目录。

不能在升级时重建环境文件并漏掉变量，也不能无意重新生成已有KEK。`deploy/pass-vault-v2.service`是带占位符模板，安装前必须替换用户/路径并按代理拓扑设置可信客户端IP头。

### 4.2 原子切换与验收

使用`scripts/deploy-linux-atomic.sh`的单一原子入口。健康失败必须恢复旧`current`并重启旧版本，不能使用有断链窗口的unlink/create两步软链操作。

验收包括：

- 本地及HTTPS health；
- 3000仅监听回环且公网不可达；
- SQLite quick/integrity check；
- 附件目录权限和抽样附件读写；
- 静态资源版本/哈希；
- 主密码登录、会话认证方式、备份导入导出；
- 已启用Passkey时用已有凭据做真实设备解锁；
- 测试账户和数据清理；
- 环境变量名称无非预期减少。

### 4.3 Linux回滚

代码回滚使用同一原子软链切换机制。代码回滚不等于SQLite/附件回滚；只有确认schema/data不兼容时才停机恢复同一备份点的SQLite和附件目录，并先保留故障现场副本。

## 5. GitHub提交与发布边界

- 只暂存本次授权范围；提交前查看`git diff --cached`和秘密扫描结果；
- 生产配置、D1/SQLite导出、R2清单、`.env`和校验文件均不得入库；
- 中英文部署指南必须同步；README、导航页、Release资产描述必须与GitHub API实际资产一致；
- 公共Wrangler模板保留占位资源和`workers_dev:true`；生产私有配置单独设置custom domain和`workers_dev:false`；
- GitHub Release只更新文字说明时不得替换既有资产或移动tag；
- 推送后读回远程branch SHA和关键文档内容，不能只相信本地`git push`输出。

只有代码/文档门禁、独立复审、目标生产验收和测试数据清理都闭环后，才能宣称发布完成。