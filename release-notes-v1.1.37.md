# Pass Vault V2 v1.1.37

[跳转到 English](#english)

## 中文

### 新增

- 附件详情内置预览（与图片类似，直接在详情页展示）：
  - **PDF**：详情内 iframe 预览
  - **文本**（txt / md / json / 代码等）：直接显示内容
  - **音频**：内置播放器
- 仍保留“下载文件”按钮
- 未知二进制类型继续仅下载

### 安全

- Cloudflare Worker 与 Linux 服务 CSP 增加 `frame-src 'self' blob:`，使解密后的 PDF 可在本地安全预览
- 预览仍在浏览器端解密后完成，服务端只存密文

### 验证

- 新增自动化：PDF / 文本 / 音频预览 + 未知类型下载
- 全量测试 127/127
- 双站部署：pass.23cm.me / passkey.23cm.me

## English

### Added

- Built-in attachment previews in the detail view (like images):
  - **PDF** via iframe
  - **Text** content inline
  - **Audio** with controls
- Download button remains available
- Unknown binary types stay download-only

### Security

- CSP now allows `frame-src 'self' blob:` for decrypted PDF preview
- Preview still happens after client-side decryption; server stores ciphertext only

### Verification

- New automated coverage for PDF / text / audio previews
- Full suite 127/127
- Deployed to both production sites
