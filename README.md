# Pass Vault V2

[中文](README.md) · [English](README.en.md)

一个移动优先、可自托管、默认采用零知识边界的密码库。共享前端可搭配 **Cloudflare Workers + Static Assets + D1** 或 **Linux Node.js + SQLite** 后端运行；可选的服务器辅助 Passkey 会明确改变该边界。

> 如果这个项目对你有帮助，欢迎点一个 Star 小星星⭐️ ，也欢迎提交问题与改进。

## 功能

- 保存账号、网站、安全笔记与TOTP动态验证码；TOTP密钥进入客户端加密载荷，浏览器本地生成默认6位、30秒自动刷新的验证码，服务端只保存密文
- 账号、网站、笔记、TOTP与附件各有隐式“全部”视图和相互独立的加密自定义分组；空分组可持久化，分组筛选可与模糊搜索组合
- 支持标签、当前分类及全站模糊搜索、编辑、置顶、最近查看与加密回收站；搜索支持中文片段与英文拼写容错，且解密后的查询和内容只在浏览器内匹配
- 笔记图片与独立附件库：上传、分类/分组筛选、预览/播放、下载、重命名、移动分组和删除
- 响应式桌面/移动界面，无需原生客户端
- 加密备份导入/导出与主密码修改
- 可选的设备级快速解锁：自动锁定后可通过平台WebAuthn用户验证（如Face ID、Touch ID或Windows Hello）解锁；仅在浏览器支持PRF扩展时启用，本机密文绑定当前账户与会话，主密码始终作为回退
- 可选的服务器辅助Passkey：先在已认证会话中注册；后续即使没有现有会话，也可通过匿名challenge和平台用户验证恢复服务器包装的vault key并创建新会话，因此会改变下述默认零知识边界
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

默认模式下，服务端只保存认证材料、由主密码派生密钥保护的 vault key、条目/附件元数据密文和附件密文对象，不接收主密码，也不持有可独立恢复 vault key 的服务器密钥。启用**服务器辅助 Passkey**后，服务端会额外保存由服务器 KEK 包装的 vault key；匿名 Passkey challenge 经 WebAuthn 用户验证、精确 RP ID/Origin、凭据归属和 counter 校验通过后，服务端可恢复该 vault key 并创建新会话。因此服务器辅助 Passkey 会改变默认零知识边界，服务器或前端失陷时可能导致已存密文被解密。主密码仍不上传；修改主密码或用户名会撤销辅助凭据。任何模式都不能替代可信终端、HTTPS、及时更新与可靠备份。

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

以下截图由本地隔离环境和虚构的 `example.com` / `example.org` 测试数据生成，不包含生产账户、密码、Cookie 或真实域名。

### 桌面端密码库

![桌面端密码库界面](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-desktop.png)

### 移动端密码库

<img src="https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-mobile.png" alt="移动端密码库界面" width="390">

### 安全中心与 Passkey

![安全中心与 Passkey 设置](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/security-center.png)

## 本地开发预览（不是服务器生产部署）

先决条件：Node.js 22+、npm，以及支持 WebCrypto 的现代浏览器。

```bash
git clone https://github.com/17sho/pass-vault-v2.git
cd pass-vault-v2
npm ci
npm test
npm run lint && npm run typecheck && npm run build
INVITE_CODE='<仅本地使用的 16–256 字符测试值>' COOKIE_SECURE=false HOST=127.0.0.1 PORT=3000 DB_PATH=./data/dev.sqlite npm start
```

打开 `http://127.0.0.1:3000`。当前版本中，`INVITE_CODE` 是**注册必填**的邀请码；缺失或格式无效时注册会安全关闭，但既有用户仍可登录。示例只用于本机预览，切勿复用到生产。`COOKIE_SECURE=false` **仅限本地 HTTP 开发**。

## 部署指南

两种部署方式完全独立，请选择对应文档：

- **Cloudflare 部署指南**：**[中文](docs/cloudflare-deployment.zh-CN.md)** · [English](docs/cloudflare-deployment.en.md) — Workers + Static Assets + D1 + R2，含 Wrangler CLI 与 Dashboard 两种方式。附件功能要求先启用 R2。
- **Linux 服务器部署指南**：**[中文](docs/server-deployment.zh-CN.md)** · [English](docs/server-deployment.en.md) — VPS/独立服务器 Node.js + SQLite、systemd、Caddy/Nginx、备份恢复。

### 获取当前可部署版本

新部署和生产升级优先从当前`main`的已审核提交构建；记录`git rev-parse HEAD`并完成全部门禁。GitHub [Release v1.1.66](https://github.com/17sho/pass-vault-v2/releases/tag/v1.1.66) 的现有资产是冻结制品：

- Cloudflare：`pass-vault-v2-cloudflare-1.1.66.tar.gz`或`.zip`
- Linux：v1.1.66及v1.1.65当前均没有可下载Linux资产，请从当前`main`源码按Linux指南构建
- 完整性校验：同时下载`SHA256SUMS`，在下载目录运行`sha256sum -c SHA256SUMS`

v1.1.66 Cloudflare冻结包使用占位D1/R2配置，且不包含`main`后续加入的`0011`–`0013` R2生命周期修复；不要替换旧tag或Release资产。Linux不存在对应Release包，不能使用会返回404的下载命令。

> **部署前必做：** 两种生产部署都必须安全设置`INVITE_CODE`。升级前先记录任务开始前版本和完整配置名称清单，保留现有普通变量、Secrets、资源绑定、路由和触发器。Cloudflare须同点备份D1/R2、应用全部待处理迁移（当前完整链至`0013`）并保留Cron；Linux须同点备份SQLite和附件目录及完整环境变量。不要清空/重建数据库，也不要把真实邀请码、资源ID或凭据写入仓库、命令参数、截图或日志。

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

**服务端能看到条目明文吗？**  默认模式下，服务端没有恢复 vault key 的独立材料，加解密发生在浏览器；但被攻陷的前端或终端仍可在解锁时读取明文。启用服务器辅助 Passkey 后，服务器持有 KEK 和额外包装材料，并能在匿名 Passkey 认证成功后恢复 vault key、创建新会话；这会扩大服务器失陷时的风险边界。

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
