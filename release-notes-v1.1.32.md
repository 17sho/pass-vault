# Pass Vault V2 v1.1.32

[跳转到 English](#english)

## 中文

### 改进

- 根据实际使用反馈，将登录页首次入场动画从 420ms 调整为更容易感知的 760ms。
- 初始位移从 8px 增加至 14px，缩放起点调整为 97%，淡入过程延长到动画的 75%，避免视觉上仍像瞬间出现。
- 动画仍只在首次打开域名时执行一次，并继续尊重系统“减少动态效果”设置。

### 验证

- 新增最短 650ms 可感知时长门槛，旧版 420ms 测试先失败后完成修复。
- Chromium、WebKit、桌面、iPhone/390px、普通和减少动态模式通过。
- 完整自动化回归 123/123 通过。

<a id="english"></a>
## English

### Improved

- Increased the initial login entrance from 420ms to a clearly perceptible 760ms based on real-device feedback.
- Increased the initial offset to 14px and scale to 97%, with the fade spanning 75% of the animation.
- The animation still runs exactly once and remains disabled under `prefers-reduced-motion`.
