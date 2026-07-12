# Invitation-gated registration threat model / 邀请注册威胁模型

The shared invitation secret, account capacity, password-KDF CPU, and user database are protected from anonymous remote attackers. The invitation is admission control, not an authentication factor or replacement for a strong master password.

共享邀请码、账户容量、密码 KDF CPU 与用户数据库须防御匿名远程攻击者。邀请码仅用于准入控制，不是认证因素，也不能替代强主密码。

- Registration fails closed when `INVITE_CODE` is absent; existing login remains available.
- Bounds are checked before comparing. Both runtimes compare SHA-256 digests in constant time and never return or log the secret.
- Invite validation and durable per-IP throttling happen before password hashing or insertion. Worker uses D1, never isolate-global mutable state; Linux uses SQLite for parity.
- Responses are generic. Production smoke evidence must not contain the invitation.
- Production values live only in a Wrangler secret and root-readable Linux environment file.

A shared code can be redistributed. IP throttling may group NAT users and can be distributed across attacker IPs. Rotate after suspected disclosure; never place the code in URLs, analytics, logs, screenshots, repositories, or release archives.