# 架构与部署边界

[中文](ARCHITECTURE.zh-CN.md) · [English](ARCHITECTURE.en.md) · [返回 README](../README.md)

## 一句话说明

Pass Vault V2 是**一个仓库、一套浏览器前端、两个独立后端适配**：

```text
同一套 public/ + shared/
          │ npm run build
          ▼
        dist/
          ├─ Cloudflare Worker + D1 + R2
          └─ Linux Node.js + SQLite + 本地附件目录
```

“共享前端”不表示两个站点共用一个在线前端服务器，也不表示账户或数据互通。每个部署包都带有自己的前端静态文件，独立运行。

## 代码复用边界

| 层 | Cloudflare | Linux | 是否共享源码 |
|---|---|---|---|
| 浏览器界面与 WebCrypto | Static Assets 中的 `dist/` | Node 服务提供的 `dist/` | 是，来自 `public/` |
| 密文契约与校验 | Worker 导入 `shared/` | Node 导入 `shared/` | 是 |
| API 后端 | `apps/worker/` | `apps/server/` | 否，分别实现相同契约 |
| 数据库 | D1 | SQLite | 否 |
| 附件对象 | 私有 R2 | 本地持久目录 | 否 |
| 账户、会话、密文 | Cloudflare 实例独立保存 | Linux 实例独立保存 | 否 |

## 数据路径

```text
浏览器内明文
  ├─ 主密码 → PBKDF2-SHA-256（310,000 次）→ KEK
  ├─ KEK 解包随机 AES-256-GCM vault key
  ├─ vault key 加密每条资料与附件元数据
  └─ 附件正文使用唯一 IV 和认证 AAD 加密
                         │
                         ▼
                 后端仅接收密文 envelope
```

默认模式下，主密码、vault key、资料明文、搜索词和解密后的分组名不会发送给后端。后端仍会看到运行服务所必需的元数据，例如账户标识、会话信息、请求时间、密文大小和对象 ID。

## 两种 Passkey 功能不可混淆

| 功能 | 包装材料位置 | 是否需要现有服务器会话 | 安全边界 |
|---|---|---|---|
| 设备快速解锁 | 当前浏览器 IndexedDB，绑定账户与会话 | 是 | 保持默认服务端边界；浏览器/整机数据迁移可能带走本地材料 |
| 服务器辅助 Passkey | 后端保存由独立 KEK 包装的 vault key | 否，可创建新会话 | **改变默认零知识边界**；服务器可在 Passkey 验证成功后恢复 vault key |

服务器辅助 Passkey 是可选功能。三项配置缺失或无效时应安全关闭，不影响主密码登录。

## 两端不会自动同步

Cloudflare 与 Linux 的用户、会话、条目、附件和配额彼此独立。需要迁移时：

1. 在源端导出加密备份；
2. 在目标端创建账户并解锁；
3. 导入备份并验证条目与附件；
4. 验证完成前保留源端数据和备份。

## 批量写入的一致性与会话边界

后端没有跨多条记录事务。浏览器对批量分组、置顶、取消置顶和移入回收站采用补偿式写入：

1. 捕获操作开始时的 vault key 和会话代际；
2. 预生成目标密文并顺序写入；
3. 中途失败时逆序补偿已成功项；
4. 补偿失败后重新加载后端权威密文；
5. 重载也失败时要求锁定并重新登录。

正向写入和补偿均绑定原会话；锁库或切换账户后，旧操作不得借用新会话继续发送。

## 发布物

每个稳定版本分别提供：

- `pass-vault-v2-cloudflare-<VERSION>.tar.gz` / `.zip`
- `pass-vault-v2-linux-<VERSION>.tar.gz` / `.zip`
- `SHA256SUMS`

两个压缩包都包含共享前端，但只包含各自后端和部署文档。生产配置、数据库、附件、路由、资源 ID 和秘密不进入制品。
