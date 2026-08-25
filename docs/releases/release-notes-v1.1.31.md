# Pass Vault V2 v1.1.31

[跳转到 English](#english)

## 中文

### 改进

- 从域名首次打开登录页时，登录卡片以平滑淡入、轻微上移和极小缩放动画出现，不再瞬间闪出。
- 动画只在页面首次加载时执行一次，不会在“创建新库/返回登录”、表单校验或登录操作中重复播放。
- 尊重系统“减少动态效果”设置：启用后登录页立即稳定显示，不产生延迟。

### 验证

- Chromium、WebKit，桌面与 iPhone/390px，普通动态和减少动态模式全部验证。
- 普通模式恰好启动一次 `auth-in`，420ms 后稳定；减少动态模式不启动动画。
- 动画仅使用 opacity/transform，不改变布局尺寸或位置，不产生布局偏移。
- 完整自动化回归 123/123 通过。

<a id="english"></a>
## English

### Improved

- The initial login card now enters with a smooth fade, subtle upward movement, and minimal scale instead of flashing into view.
- The entrance runs exactly once on the initial domain load and does not replay while switching auth modes or submitting the form.
- `prefers-reduced-motion` remains immediate and animation-free.

### Verification

- Verified in Chromium and WebKit across desktop and mobile viewports, with normal and reduced motion.
- The composited animation does not alter layout geometry or cause layout shifts.
