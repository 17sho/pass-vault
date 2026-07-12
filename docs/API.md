# API 契约
所有响应 JSON，错误 `{error}`；认证 Cookie `pv_session`。写请求必须同源并带 `X-CSRF-Token`。

- `POST /api/register` `{username,password,kdf,wrappedKey}`
- `POST /api/login` → `{csrf,kdf,wrappedKey}`
- `GET /api/session` → `{username,kdf,wrappedKey}`
- `POST /api/logout`
- `POST /api/change-username` `{newUsername,currentPassword}`。仅允许这两个字段；成功原子更新用户名、清除该用户全部会话并过期 Cookie，不修改密码、KDF、包装密钥或条目密文。当前密码错误返回 `401 {error:'invalid_current_password'}`，用户名无效返回 `400 {error:'invalid_username'}`，重复返回 `409 {error:'username_taken'}`。
- `POST /api/change-password` `{currentPassword,newPassword,kdf,wrappedKey}`。成功清除全部会话并过期 Cookie；当前密码错误返回 `401 {error:'invalid_current_password'}`，新密码格式错误返回 `400 {error:'invalid_new_password'}`，KDF/包装密钥材料异常返回 `400 {error:'invalid_key_material'}`。
- `GET /api/entries` → `{items}`
- `PUT /api/entries/:id` 密文 envelope
- `DELETE /api/entries/:id`
- `GET /api/backup` → `{version:1,kdf,wrappedKey,envelopes}`
- `PUT /api/backup` 原子替换当前用户的包装密钥和全部密文条目

Envelope 仅允许 `{id,type,version,iv,ciphertext}`；type 为 account/website/note。业务字段必须全部包含在 ciphertext 中。备份格式为包含 kdf、wrappedKey、envelopes 的 JSON；它本身不增加明文。
# 用户名契约

注册和登录的 `username` 均存储/查询 trim 后的值。允许任意 Unicode（含中文、内部空格、emoji、常见符号），不改变大小写且不做 Unicode 规范化；trim 后不可为空，按 JavaScript UTF-16 `String.length` 计最多 80 个字符，并拒绝 Unicode 控制/格式字符（含 NUL）。违规返回 HTTP 400 `{ "error": "invalid_username" }`。用户名按数据库精确值唯一匹配。

