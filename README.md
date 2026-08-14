# Pass Vault V2

[![Latest release](https://img.shields.io/github/v/release/17sho/pass-vault-v2?sort=semver)](https://github.com/17sho/pass-vault-v2/releases/latest) [![License](https://img.shields.io/github/license/17sho/pass-vault-v2)](LICENSE)

[中文](README.md) · [English](README.en.md)

移动优先、浏览器端加密、可自托管的开源密码库。

- 账号、网站、安全笔记、TOTP、附件与加密备份
- WebCrypto 客户端加密；默认模式下，主密码与资料明文不上传
- 支持设备快速解锁与可选的服务器辅助 Passkey
- Cloudflare Workers + D1 + R2，或 Linux + SQLite
- 两种部署独立运行，不共享账户、会话或生产数据

> 服务器辅助 Passkey 会改变默认零知识边界。部署前请阅读[架构与安全边界](docs/ARCHITECTURE.zh-CN.md)。

## 快速入口

| 需要了解 | 中文 | English |
|---|---|---|
| 主要功能与平台范围 | [功能介绍](docs/FEATURES.zh-CN.md) | [Features](docs/FEATURES.en.md) |
| 架构、加密与 Passkey 边界 | [架构说明](docs/ARCHITECTURE.zh-CN.md) | [Architecture](docs/ARCHITECTURE.en.md) |
| Cloudflare 部署 | [部署指南](docs/cloudflare-deployment.zh-CN.md) | [Deployment guide](docs/cloudflare-deployment.en.md) |
| Linux 部署 | [部署指南](docs/server-deployment.zh-CN.md) | [Deployment guide](docs/server-deployment.en.md) |
| API 契约 | [API](docs/API.md) | [API](docs/API.md) |
| 本地开发与测试 | [开发指南](docs/DEVELOPMENT.md) | [Development](docs/DEVELOPMENT.md) |
| 安全说明 | [安全政策](SECURITY.md) | [Security](SECURITY.md) |
| 贡献 | [贡献指南](CONTRIBUTING.md) | [Contributing](CONTRIBUTING.md) |

## 获取版本

最新稳定版：[**v2.2.0**](https://github.com/17sho/pass-vault-v2/releases/tag/v2.2.0)

当前公开资产：

- `pass-vault-v2-cloudflare-2.2.0.tar.gz`
- `pass-vault-v2-cloudflare-2.2.0.zip`
- `SHA256SUMS`

下载后请校验 `SHA256SUMS`。Linux 请按对应部署指南从源码安装。

## 安全提示

这是安全敏感软件。请在部署前审查源码和威胁模型，使用 HTTPS，并保留经过恢复验证的加密备份。项目尚未经过独立第三方安全审计。

安全漏洞请通过 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new) 私下报告。

如果项目对你有帮助，欢迎点一个 Star ⭐️。

[MIT License](LICENSE)
