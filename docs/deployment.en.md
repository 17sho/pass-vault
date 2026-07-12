# Deployment documentation

This legacy URL remains as a short navigation page to prevent broken links. Choose a dedicated guide:

> **Required in v1.1.13:** every target must configure `INVITE_CODE`; otherwise new registration fails closed (existing sign-in remains available). Do not use generic commands from this chooser—follow the target guide to generate, store, verify, and rotate it safely. Cloudflare must also apply `0005_invite_attempts.sql` before deployment.

- [Cloudflare deployment guide](cloudflare-deployment.en.md) · [中文](cloudflare-deployment.zh-CN.md)
- [Linux server deployment guide](server-deployment.en.md) · [中文](server-deployment.zh-CN.md)
- [Back to the English README](../README.en.md)
