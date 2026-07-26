# Pass Vault v1.1.42

## 安全修复：反向代理后限流按真实客户端 IP 隔离

### 问题
登录与注册的限流以来源 IP 作为计数键，但生产环境运行在反向代理（Cloudflare → Caddy → Node）之后。此前后端读取的是 TCP socket 的 `remoteAddress`，在反代下**恒为 `127.0.0.1`**，导致所有用户共用同一个限流桶：

- 攻击者每分钟发起 10 次失败登录，即可让 `429` 命中**全站所有用户**，形成拒绝服务（DoS）。
- 限流不仅拦不住攻击者，反而连坐了正常用户。

### 修复
- 新增 `CLIENT_IP_HEADER` 环境变量。生产设为 `cf-connecting-ip`（Cloudflare 边缘强制写入、客户端无法伪造），后端据此识别真实来源 IP，按 IP 独立限流。
- 未配置该变量时**安全回退**为直连 socket IP，并忽略客户端自带的转发头，避免直连部署被伪造头绕过。
- 部署示例同步更新：
  - `deploy/pass-vault-v2.service` 加入 `CLIENT_IP_HEADER=cf-connecting-ip` 及说明。
  - `deploy/nginx.conf` 加入 `X-Forwarded-For $remote_addr` 覆盖，防止客户端伪造转发头。

### 影响范围
- 仅 Linux（自托管）后端。Cloudflare Worker 后端本就使用 `CF-Connecting-IP`，不受此问题影响。
- 零知识加密、CSRF、会话、数据格式均无变化，无需迁移。

### 验证
- 新增集成红测：攻击者 IP 刷满 `429` 后，其他真实 IP 仍可正常登录（不连坐）；未配置可信头时伪造 IP 头不得绕过限流。
- 全量回归通过；双站（pass.23cm.me / passkey.23cm.me）部署并验证。
