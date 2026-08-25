# Pass Vault V2 v1.1.34

[跳转到 English](#english)

## 中文

### 改进

- 登录成功后不再直接闪切到密码库：登录卡片先以 320ms 平滑淡出并轻微上移，随后使用页面以 720ms 淡入、轻微上移和缩放恢复。
- 页面内容在过渡前只渲染一次，过渡中不会重新创建资料卡片，避免抖动、延迟透明和旧内容闪现。
- 尊重系统“减少动态效果”设置，启用时立即稳定切换。

### 验证

- 正常动态模式必须捕获且仅捕获一次 `vault-reveal`，持续至少 650ms，并包含肉眼可见的早期透明阶段。
- Chromium 390px 与 WebKit iPhone、普通与减少动态模式均通过。
- 完整自动化回归 124/124 通过。

<a id="english"></a>
## English

### Improved

- Login now transitions smoothly into the vault: the auth card exits over 320ms, followed by a 720ms vault fade/translate/scale reveal.
- Vault content is rendered once before the transition and is not recreated during reveal.
- Reduced-motion mode remains immediate and stable.
