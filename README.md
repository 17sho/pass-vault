# Pass Vault V2

[中文](README.md) · [English](README.en.md)

一个移动优先、可自托管的零知识密码库。共享前端可搭配 **Cloudflare Workers + Static Assets + D1** 或 **Linux Node.js + SQLite** 后端运行。

> 如果这个项目对你有帮助，欢迎点一个 Star 小星星⭐️ ，也欢迎提交问题与改进。

## 功能

- 保存账号、网站与安全笔记，支持标签、当前分类内模糊搜索、编辑与删除；搜索支持中文片段与英文拼写容错，且解密后的查询和内容只在浏览器内匹配
- 账号、网站、笔记与附件拥有相互独立的加密自定义分组；空分组可持久化，分组筛选可与模糊搜索组合
- 笔记图片与独立附件库：上传、分类/分组筛选、预览/播放、下载、重命名、移动分组和删除
- 响应式桌面/移动界面，无需原生客户端
- 加密备份导入/导出与主密码修改
- 完整认证、会话、CSRF、同源检查和限速
- 同一密文 API 契约、两种独立部署方式

## 零知识架构

```text
主密码（仅浏览器）
  └─ PBKDF2-SHA-256（随机盐，310,000 次）→ KEK
       └─ 解包随机 AES-256-GCM vault key
            ├─ 每个条目/附件元数据在浏览器单独加密 → 密文 envelope → 后端
            └─ 每个附件以唯一 IV + 认证 AAD 加密 → 密文对象 → R2/服务器磁盘
```

服务端只保存认证材料、被包装的 vault key、条目/附件元数据密文和附件密文对象，不应接触主密码、vault key、明文文件名、MIME 或内容。零知识设计不能替代可信终端、HTTPS、及时更新与可靠备份；恶意或被攻陷的前端仍可能窃取解锁后的数据。

## 两个版本的区别

| | Cloudflare 版 | Linux 版 |
|---|---|---|
| 运行时 | Workers + Static Assets | Node.js 22+ |
| 数据库/附件存储 | D1 + R2（使用附件功能前必须先启用并绑定 R2） | SQLite + Linux 服务器磁盘（附件功能可用） |
| 运维 | Wrangler / Cloudflare Dashboard | systemd + Caddy/Nginx |
| 适合 | 无服务器、边缘部署 | 完全掌控主机与数据文件 |
| 数据同步 | **不与 Linux 版自动同步** | **不与 Cloudflare 版自动同步** |

两套账户与数据完全独立。迁移时在源端导出**加密备份**，在目标端先创建账户并解锁，再导入；验证成功前保留源数据。

Cloudflare 版为避免 R2 超额费用而设有月度应用级配额；Linux 版不使用 R2，因此没有这些月度配额，总容量由服务器磁盘与管理员配置决定。两版无需强行保持相同的资源策略。

## 截图

> 截图占位：发布前可在 `docs/images/` 添加使用空白测试数据生成的桌面端与移动端截图；不得包含真实账户、域名、密码、Cookie 或其他敏感信息。

## 本地开发预览（不是服务器生产部署）

先决条件：Node.js 22+、npm，以及支持 WebCrypto 的现代浏览器。

```bash
git clone https://github.com/17sho/pass-vault-v2.git
cd pass-vault-v2
npm ci
npm test
npm run lint && npm run typecheck && npm run build
COOKIE_SECURE=false HOST=127.0.0.1 PORT=3000 DB_PATH=./data/dev.sqlite npm start
```

打开 `http://127.0.0.1:3000`。这一段只用于开发者在电脑上快速预览，并不是服务器部署教程。`COOKIE_SECURE=false` **仅限本地 HTTP 开发**。

## 部署指南

两种部署方式完全独立，请选择对应文档：

- **Cloudflare 部署指南**：**[中文](docs/cloudflare-deployment.zh-CN.md)** · [English](docs/cloudflare-deployment.en.md) — Workers + Static Assets + D1 + R2，含 Wrangler CLI 与 Dashboard 两种方式。附件功能要求先启用 R2；本项目不宣称 Cloudflare 生产环境已部署。
- **Linux 服务器部署指南**：**[中文](docs/server-deployment.zh-CN.md)** · [English](docs/server-deployment.en.md) — VPS/独立服务器 Node.js + SQLite、systemd、Caddy/Nginx、备份恢复。
- [下载最新 v1.1.11 Release 包](https://github.com/17sho/pass-vault-v2/releases/tag/v1.1.11)

Cloudflare 版使用的 Workers、Static Assets、D1、R2 Standard、DNS/SSL 均有免费层；部署指南已列出 D1/R2 额度、项目 R2 保守硬限制、账户级共享风险、Billing/Usage 检查路径，以及避免 Web Analytics 自动注入破坏密码库 CSP 的设置方法。

旧的综合部署 URL 仍保留为[简短导航页](docs/deployment.zh-CN.md)，避免外部链接失效。

## 仓库结构

- `public/`：共享前端与浏览器 WebCrypto
- `shared/`：两后端共享的密文 API 契约
- `apps/worker/`：Cloudflare Worker、D1 migration 与 Wrangler 配置
- `apps/server/`：Linux Node.js + SQLite 后端
- `scripts/`：构建、校验与迁移工具
- `deploy/`：systemd 示例
- `tests/`：契约、后端与 UI 测试
- `docs/`：API 与部署文档

## 安全警告

- 这是安全敏感软件；自行部署前请审查代码并评估风险。
- 忘记主密码且没有可用备份时，数据无法恢复。
- 只通过 HTTPS 使用生产实例；保护服务器、Cloudflare 账户和备份。
- 不要把数据库、备份、`.env`、真实域名、账户 ID 或密钥提交到仓库。
- 导入前验证备份来源；在隔离位置保存多份加密备份并测试恢复。
- 安全漏洞请按 [`SECURITY.md`](SECURITY.md) 私下报告，不要公开披露。

## FAQ

**Cloudflare 与 Linux 版会自动同步吗？**  不会。它们是共享前端/契约的两个独立后端。

**服务端能看到条目明文吗？**  按设计不能；加解密发生在浏览器。但被攻陷的前端或终端可在解锁时读取明文。

**可以找回主密码吗？**  不可以。请妥善保存主密码和经过验证的加密备份。

**如何在两个版本间迁移？**  从源版本导出加密备份，在目标版本注册/登录并解锁后导入。目标端不会自动获得源端账户。

**生产环境可以直接运行 `npm start` 并暴露端口吗？**  不建议。请使用专用用户、systemd、仅监听回环地址，并由 Caddy/Nginx 提供 HTTPS。

## 贡献

请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。提交前运行：

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

## 许可证

本项目采用 [MIT License](LICENSE) 开源。你可以自由使用、修改和分发，但请保留许可证与版权声明。
