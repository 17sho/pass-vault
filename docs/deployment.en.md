# Deployment documentation

This legacy URL remains as a short navigation page to prevent broken links. Choose a dedicated guide:

> **Required before deploying v1.1.66:** every target must configure `INVITE_CODE`; otherwise new registration fails closed while existing sign-in remains available. Server-assisted Passkeys additionally require an independent `PASSKEY_UNLOCK_KEK` and exact `PASSKEY_RP_ID`/`PASSKEY_ORIGIN`. Cloudflare must apply every pending migration before deploying code. Open the target guide for download, verification, installation, backup, and acceptance steps.

- [Cloudflare deployment guide](cloudflare-deployment.en.md) · [中文](cloudflare-deployment.zh-CN.md)
- [Linux server deployment guide](server-deployment.en.md) · [中文](server-deployment.zh-CN.md)
- [Download the v1.1.66 Cloudflare package and SHA256SUMS](https://github.com/17sho/pass-vault-v2/releases/tag/v1.1.66) (the stable Linux artifact remains [v1.1.65](https://github.com/17sho/pass-vault-v2/releases/tag/v1.1.65))
- [Back to the English README](../README.en.md)
