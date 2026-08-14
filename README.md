# Pass Vault V2

[![Latest release](https://img.shields.io/github/v/release/17sho/pass-vault-v2?sort=semver)](https://github.com/17sho/pass-vault-v2/releases/latest) [![License](https://img.shields.io/github/license/17sho/pass-vault-v2)](LICENSE)

[中文](README.md) · [English](README.en.md)

一个移动优先、浏览器端加密、可自托管的开源密码库。同一套前端源码可分别部署到 Cloudflare Workers + D1 + R2，或 Linux Node.js + SQLite；两种部署不共享账户、会话或生产数据。

> 如果这个项目对你有帮助，欢迎点一个 Star ⭐️。

## 主要功能

- 保存账号、网站、安全笔记、TOTP 动态验证码和加密附件
- 常规资料自定义字段，以及分组、标签、收藏、置顶、最近查看和回收站
- 浏览器本地模糊搜索、批量整理、加密备份导入与导出
- 支持笔记图片和独立附件库：预览、播放、下载、重命名、分组和删除
- 支持设备级快速解锁，以及可选的服务器辅助 Passkey
- 响应式桌面与移动界面，无需原生客户端
- revision CAS、删除 tombstone、CSRF、同源检查、会话控制和限速

Cloudflare v2.2.0 还提供独立 `custom` 自定义资料、加密历史与恢复中心、安全分享 v2、跨页收藏，以及可选的 Cloudflare Admin 与配额管理。完整说明和平台范围请查看 **[功能介绍](docs/FEATURES.zh-CN.md)**。

## 加密与部署边界

```text
主密码（仅浏览器）
  └─ PBKDF2-SHA-256 → KEK
       └─ 解包随机 AES-256-GCM vault key
            ├─ 资料与附件元数据在浏览器加密 → 后端保存密文
            └─ 附件正文以唯一 IV + 认证 AAD 加密 → R2 / 本地磁盘
```

默认模式下，主密码与资料明文不上传。服务器辅助 Passkey 会增加由服务器 KEK 包装的 vault key，使服务器可在 Passkey 验证成功后恢复 vault key 并创建会话，因此服务器辅助 Passkey 会改变默认零知识边界。启用前请阅读 **[架构与安全边界](docs/ARCHITECTURE.zh-CN.md)**。

| | Cloudflare 版 | Linux 版 |
|---|---|---|
| 运行时 | Workers + Static Assets | Node.js 22+ |
| 数据库 / 附件 | D1 + R2 | SQLite + 本地磁盘 |
| 运维 | Wrangler / Dashboard | systemd + Caddy/Nginx |
| 数据同步 | 不与 Linux 自动同步 | 不与 Cloudflare 自动同步 |

## 产品截图

以下截图使用隔离环境和虚构测试数据生成，不包含生产账户、密码、Cookie 或真实域名。

### 桌面端密码库

![桌面端密码库界面](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-desktop.png)

### 移动端密码库

<img src="https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-mobile.png" alt="移动端密码库界面" width="390">

### 安全中心与 Passkey

![安全中心与 Passkey 设置](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/security-center.png)

## 文档

| 需要了解 | 中文 | English |
|---|---|---|
| 完整功能与平台范围 | [功能介绍](docs/FEATURES.zh-CN.md) | [Features](docs/FEATURES.en.md) |
| 架构、加密与 Passkey 边界 | [架构说明](docs/ARCHITECTURE.zh-CN.md) | [Architecture](docs/ARCHITECTURE.en.md) |
| Cloudflare 部署 | [部署指南](docs/cloudflare-deployment.zh-CN.md) | [Deployment guide](docs/cloudflare-deployment.en.md) |
| Linux 部署 | [部署指南](docs/server-deployment.zh-CN.md) | [Deployment guide](docs/server-deployment.en.md) |
| API、开发与安全 | [API](docs/API.md) · [开发](docs/DEVELOPMENT.md) · [安全](SECURITY.md) | [API](docs/API.md) · [Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md) |

## 获取版本

最新稳定版：[**v2.2.0**](https://github.com/17sho/pass-vault-v2/releases/tag/v2.2.0)

当前公开资产为 `pass-vault-v2-cloudflare-2.2.0.tar.gz`、`.zip` 和 `SHA256SUMS`；Linux 请按对应部署指南从源码安装。下载后请校验 `SHA256SUMS`。

## 安全提示

这是安全敏感软件。请在部署前审查源码和威胁模型，只通过 HTTPS 使用，并保留经过恢复验证的加密备份。项目尚未经过独立第三方安全审计。

安全漏洞请通过 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new) 私下报告。

[贡献指南](CONTRIBUTING.md) · [MIT License](LICENSE)
