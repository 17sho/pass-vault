# API 契约 / API contract

本文档描述 Cloudflare Worker/D1/R2 与 Linux Node/SQLite 后端共同实现的**密文 HTTP 契约**。浏览器 UI 不是公共 SDK；升级时以当前稳定 tag、`shared/contract.mjs` 与双后端测试为准。

## 通用规则 / General rules

- 响应为 JSON；错误格式为 `{ "error": "<code>" }`，`204` 除外。
- 认证使用 `HttpOnly` Cookie `pv_session`。
- 非 `GET` 认证请求必须同源并携带 `X-CSRF-Token`。
- 主密码仅用于注册、登录和需要再次验证身份的账户操作；条目 API 只接受密文。
- 所有条目和附件均按当前用户做所有权隔离。
- 不要记录请求正文、Cookie、CSRF、密文、数据库导出或秘密。

## 核心类型 / Core types

### KDF 与包装密钥

```json
{
  "kdf": {
    "salt": "<base64url>",
    "iterations": 310000,
    "hash": "SHA-256"
  },
  "wrappedKey": {
    "iv": "<base64url>",
    "ciphertext": "<base64url>"
  }
}
```

`hash` 可省略以兼容旧数据，但若存在必须为 `SHA-256`。

### 条目密文 envelope

```json
{
  "id": "<opaque-id>",
  "type": "account | website | note | totp | settings",
  "version": 1,
  "iv": "<base64url>",
  "ciphertext": "<base64url>"
}
```

- 普通类型：`account`、`website`、`note`、`totp`。
- `settings` 仅允许保留 ID `settings_registry` 和 `recents_registry`。
- 分组名、分组归属、置顶、`pinRank`、`deletedAt`、最近查看和业务字段都位于 `ciphertext` 中。
- `PUT /api/entries/:id` 的路径 ID 必须与 envelope ID 一致；未知字段应拒绝。

### 附件记录

附件分为：

1. 加密 metadata envelope：文件名、MIME、大小、类别、关联笔记、分组、置顶和回收站状态；
2. 加密正文对象：Cloudflare 存入私有 R2，Linux 存入本地附件目录。

后端不会解密附件 metadata 或正文。只有永久删除才物理删除对象；普通删除只更新加密 metadata。

## 端点 / Endpoints

### 健康检查

| 方法 | 路径 | 响应 |
|---|---|---|
| `GET` | `/api/health` | `{ok:true,backend:"d1"}` 或 `{ok:true,backend:"sqlite"}` |

### 注册、登录与账户

| 方法 | 路径 | 请求/响应要点 |
|---|---|---|
| `POST` | `/api/register` | `{username,password,inviteCode,kdf,wrappedKey}`；邀请码缺失/配置无效时安全关闭注册 |
| `POST` | `/api/login` | `{username,password}` → `{csrf,sessionId,kdf,wrappedKey}`；Cloudflare Worker 额外返回部署能力 `capabilities` |
| `GET` | `/api/session` | `{username,sessionId,kdf,wrappedKey}`；Cloudflare Worker 额外返回部署能力 `capabilities` |
| `POST` | `/api/logout` | 撤销当前会话并过期 Cookie |
| `POST` | `/api/change-username` | `{newUsername,currentPassword}`；成功后撤销该用户全部会话与服务器辅助 Passkey |
| `POST` | `/api/change-password` | `{currentPassword,newPassword,kdf,wrappedKey}`；成功后撤销全部会话与服务器辅助 Passkey |

用户名按 `trim()` 后的原值精确匹配，不改变大小写、不做 Unicode 规范化；最多 80 个 JavaScript UTF-16 code units，拒绝控制/格式字符。

### 会话管理

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/sessions` | 返回当前用户有效会话的公开 ID、时间、IP、设备、浏览器、认证方式和 `current` |
| `DELETE` | `/api/sessions/:id` | 撤销其他会话；不能撤销当前会话 |
| `POST` | `/api/sessions/logout-others` | 撤销除当前会话外的全部会话 |

不会返回会话哈希、CSRF、Cookie、用户内部 ID 或完整 User-Agent。

### 条目

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/entries` | `{items: Envelope[]}` |
| `PUT` | `/api/entries/:id` | 创建或替换当前用户的一条密文 envelope |
| `DELETE` | `/api/entries/:id` | 永久删除密文记录；普通回收站操作不调用此端点 |

### 附件

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/attachments` | 返回当前用户的加密 metadata 记录列表 |
| `POST` | `/api/attachments/:id` | 创建附件：请求头 `X-Attachment-Metadata` 携带加密 metadata envelope，请求正文为 `application/octet-stream` 加密正文 |
| `GET` | `/api/attachments/:id/content` | 下载加密正文对象 |
| `PUT` | `/api/attachments/:id/metadata` | 替换加密 metadata，不改正文 |
| `DELETE` | `/api/attachments/:id` | 永久删除 metadata 与密文正文对象 |

正文大小与配额由部署配置约束。Cloudflare Worker 的 `/api/session` 会返回 `capabilities`，并可返回 `quota_exceeded`；Linux 不返回该能力对象，也不应用 R2 月度配额。

### 加密备份

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/backup` | v1：KDF、wrapped key 和条目 envelopes |
| `GET` | `/api/backup?attachments=1` | v2：额外包含附件 metadata 与密文正文 |
| `PUT` | `/api/backup` | 原子恢复当前用户备份 |
| `POST` | `/api/backup/import` | 仅 Linux Node 后端提供的 `PUT /api/backup` 兼容别名；Cloudflare Worker 只接受 `PUT /api/backup` |

浏览器导入前必须用当前 vault key 解密验证全部条目和附件 metadata，并用当前登录账户的 `kdf` / `wrappedKey` 替换备份内材料，避免旧备份改变当前主密码。

### 服务器辅助 Passkey

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| `POST` | `/api/passkeys/authentication/options` | 匿名 | 创建一次性认证 challenge |
| `POST` | `/api/passkeys/authentication/complete` | 匿名 | 验证 Passkey，恢复服务器包装的 vault key 并创建会话 |
| `POST` | `/api/passkeys/registration/options` | 已登录 | 创建注册 challenge |
| `POST` | `/api/passkeys/registration/complete` | 已登录 | 再验当前主密码并保存辅助凭据与包装材料 |
| `GET` | `/api/passkeys` | 已登录 | 列出当前用户辅助凭据元数据 |
| `DELETE` | `/api/passkeys/:credentialId` | 已登录 | 再验当前主密码并撤销凭据 |

服务器辅助 Passkey 需要精确 RP ID/Origin、用户验证、凭据归属、counter 检查、一次性 challenge 和失败限速。它改变默认零知识边界，详见 [`ARCHITECTURE.zh-CN.md`](ARCHITECTURE.zh-CN.md)。

## 常见错误码 / Common error codes

| HTTP | code | 含义 |
|---|---|---|
| `400` | `invalid_request`, `invalid_username`, `invalid_envelope`, `invalid_backup` | 请求结构或密文契约无效 |
| `401` | `invalid_credentials`, `unauthorized`, `invalid_current_password` | 凭据或会话无效 |
| `403` | `origin`, `csrf`, `invalid_invite` | 同源、CSRF 或邀请码校验失败 |
| `404` | `not_found`, `session_not_found`, `passkey_not_found` | 目标不存在或不属于当前用户 |
| `409` | `username_taken`, `current_session` | 唯一性或当前会话冲突 |
| `413` | `too_large` | 请求或备份超过限制 |
| `429` | `rate_limited` | 认证尝试过多 |
| `503` | `registration_unavailable`, `passkey_unlock_unavailable`, `quota_exceeded` | 功能未配置或应用安全配额阻断 |

## 兼容性规则 / Compatibility rules

- 契约变更必须同步更新 `shared/`、两个后端、浏览器客户端、本文档和测试。
- 只新增 D1 migration，不重写已执行 migration。
- Linux schema 迁移必须幂等并保留既有密文。
- 新客户端必须安全兼容旧 envelope 和无新设置记录的旧备份。
