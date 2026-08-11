# PassVault v2.1.0

> Cloudflare Worker / D1 / R2 公开发行版

本版本聚焦移动端资料整理能力，新增完整的自定义资料和加密个人模板流程，并包含标签、收藏、隐私保护及 Cloudflare 管理能力改进。

## 主要更新

- **自定义资料**：可从空白资料或六种内置模板创建，自由增删、排序字段并选择适合的字段类型。
- **个人模板**：将当前字段结构保存为加密模板；只保存字段名称、类型和顺序，不保存任何字段内容。
- **完整资料生命周期**：自定义资料支持搜索、分组、置顶、回收站、批量操作、备份导出和恢复。
- **移动端体验**：优化个人模板、更多操作、标签筛选和管理弹窗；覆盖 Chromium/WebKit 的桌面、390px 与 320px 视口。
- **Cloudflare 管理面板**：注册控制、用户与审计操作、配额及系统状态视图。

## 升级说明

1. 按顺序应用 D1 migrations；本版本新增 `apps/worker/migrations/0020_custom_entries.sql`。
2. 将示例 Wrangler 配置中的 D1、R2、路由和管理员邮箱替换为自己的资源。
3. 通过 Wrangler secrets 配置敏感值，不要把 token、密钥或生产配置写进仓库。
4. 构建并部署 Cloudflare Worker：

```bash
npm ci
npm run build
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

## 安全边界

- 资料和个人模板内容均以密文 envelope 保存；服务端不接收资料明文。
- 发布资产不含生产域名、账户邮箱、Cloudflare 资源 ID、数据库备份或凭据。
- Passkey 辅助解锁会改变纯客户端零知识边界；启用前请阅读界面提示并继续保管主密码。

## 校验

下载资产后可使用 Release 中的 SHA-256 校验值复核完整性。
