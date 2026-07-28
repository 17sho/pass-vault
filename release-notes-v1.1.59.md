# v1.1.59 - 加密TOTP动态验证码

## 中文

- 顶部新增独立TOTP菜单，位于“笔记”和“附件”之间；录入账号与Base32密钥后，本地显示默认6位验证码、剩余秒数并每秒校时刷新。
- TOTP密钥与账号进入现有AES-256-GCM客户端加密载荷；网络与服务端只接收`id/type/version/iv/ciphertext`密文envelope，详情不直接显示密钥。
- 支持分组、搜索、置顶、最近查看、回收站及加密备份；旧四分类分组设置会自动补全空TOTP分类。
- 算法遵循RFC 6238默认SHA-1、30秒周期和6位输出，并由标准测试向量验证。
- Cloudflare升级必须先执行`0007_totp_entries.sql`；Linux启动迁移会幂等扩展类型约束并保留旧密文与创建时间。
- 安全提示：把密码和TOTP保存在同一密码库更方便，但不等同于将第二因素保存在独立设备或硬件密钥中。

## English

- Adds a dedicated TOTP tab between Notes and Attachments. Enter an account label and Base32 secret to display a local six-digit code, countdown, and time-synchronized refresh.
- The account and TOTP secret stay inside the existing AES-256-GCM client-encrypted payload. Network requests and backend storage receive only the ciphertext envelope, and details do not reveal the secret.
- TOTP records participate in groups, search, pinning, recents, encrypted trash, and encrypted backups. Legacy four-category group registries gain an empty TOTP category automatically.
- Generation follows RFC 6238 defaults: SHA-1, a 30-second period, and six digits, verified against standard vectors.
- Cloudflare upgrades must apply `0007_totp_entries.sql` before deploying code. Linux startup migrates the type constraint idempotently while preserving existing ciphertext and creation times.
- Security note: keeping passwords and TOTP in one vault improves convenience but does not provide the same factor separation as an independent authenticator or hardware key.

> 提供Cloudflare与Linux两套平台安装包、`.tar.gz`/`.zip`格式及`SHA256SUMS`完整性校验；Release附件不包含任何生产配置、真实域名、资源ID或凭据。
