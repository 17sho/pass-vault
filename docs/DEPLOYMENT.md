# 生产部署与回滚

> **旧版内部运维说明：** 公开部署请改用完整的 [Cloudflare 中文](cloudflare-deployment.zh-CN.md) / [English](cloudflare-deployment.en.md) 或 [Linux 中文](server-deployment.zh-CN.md) / [English](server-deployment.en.md) 指南。v1.1.13 起 `INVITE_CODE` 必填；缺失时注册安全关闭。Cloudflare 必须先执行 `0005_invite_attempts.sql`。本页不提供秘密配置快捷方式，避免把目标特定步骤混用。

Pass Vault V2 同时运行两个独立生产版本：

- Cloudflare Worker：部署者配置的域名，API 与静态资源由 Worker 提供，数据存于部署者创建的 D1。
- Linux Node：部署者配置的域名，数据存于服务器 SQLite；生产文件位置以服务的 `DB_PATH` 为准。

两套数据不自动同步。所有部署和回滚都必须只操作目标版本，且不得把 D1 与 SQLite 当作主从数据库。

## 发布前检查

在仓库根目录分别运行并保留真实输出：

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

构建会把 `public/` 与共享契约生成到 `dist/`。只有源代码或构建产物变化时才需要发布运行时/静态资源；纯 Markdown 变更不要求重发。

## Cloudflare Worker + D1

配置位于 `apps/worker/wrangler.jsonc`，D1 迁移位于 `apps/worker/migrations/`。

```bash
cd apps/worker
npx wrangler whoami
npx wrangler d1 export "$D1_DATABASE_NAME" --remote --output "$BACKUP_DIR/d1-pre-$(date +%Y%m%d%H%M%S).sql"
npx wrangler d1 migrations list "$D1_DATABASE_NAME" --remote
npx wrangler d1 migrations apply "$D1_DATABASE_NAME" --remote # 确认包含 0005_invite_attempts.sql
npx wrangler deploy
npx wrangler versions list
```

发布后至少验证主页、健康检查和迁移入口：

```bash
curl -fsS "$WORKER_ORIGIN/api/health"
curl -fsS "$WORKER_ORIGIN/" | grep '导入加密备份'
```

涉及 API、认证或数据库的变更还必须执行远程注册、登录、CSRF 拒绝、密文条目增删、备份导入导出和退出 smoke test。测试账户必须使用可识别前缀并在确认无条目/会话后清理，绝不能用宽泛条件删除真实用户。

### Worker 回滚

```bash
cd apps/worker
npx wrangler versions list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID>
```

回滚 Worker 代码不会自动回滚 D1。若迁移不向后兼容，应先停止写入，再用发布前 D1 导出恢复到单独数据库并切换绑定，或执行经过审查的前向修复迁移；不要直接覆盖仍在写入的生产 D1。

## Linux Node + SQLite

服务器发布时先确认 systemd 服务中的 `DB_PATH`，备份该 SQLite 文件，再将本次 `dist/` 同步到服务实际静态资源目录并重启服务。不要假设仓库内 `data/pass-vault.sqlite` 就是生产库。

示例流程（路径以服务器实际配置替换）：

```bash
sqlite3 "$DB_PATH" '.backup /安全备份目录/pass-vault-pre-deploy.sqlite'
rsync -a --delete dist/ "$STATIC_ROOT"/
systemctl restart pass-vault-v2
curl -fsS "$NODE_ORIGIN/" | grep '导入加密备份'
```

### 服务器回滚

恢复上一版应用与静态资源，然后重启服务。若 SQLite schema/data 也必须回退，先停止服务并保留故障现场副本，再恢复发布前 `.backup`：

```bash
systemctl stop pass-vault-v2
cp "$DB_PATH" "/安全备份目录/pass-vault-failed-$(date +%Y%m%d%H%M%S).sqlite"
cp /安全备份目录/pass-vault-pre-deploy.sqlite "$DB_PATH"
systemctl start pass-vault-v2
```

回滚后重新验证首页、登录和“导入加密备份”入口。源站或另一生产版本的数据不得因回滚而删除。
