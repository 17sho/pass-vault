# pass-vault-v2 v1.1.38

## 修复
- iPhone / iPad Safari 打开 PDF 附件时，详情页不再是空白浅蓝框。
- 改为本地解密后用 PDF.js 画到 canvas（不依赖系统 PDF iframe）。
- 支持上一页 / 下一页。

## 说明
- 文本、音频内置预览保持不变。
- 仍可一键下载原文件。
- 预览只在本机解密，服务端仍只存密文。

## 验证
- Chromium + WebKit 自动化：PDF canvas 非空白像素断言通过。
- 全量测试通过后发版。
