# Pass Vault iOS — MVP Specification

## Objective
Build a native SwiftUI, local-only encrypted password vault for personal iPhone/iPad use. It must require no server and produce an unsigned arm64 IPA that the owner can re-sign.

## Assumptions approved
- Private GitHub repository under `17sho`.
- Fixed default bundle identifier: `me.23cm.passvault.local` (the re-signing tool may override it, but keeping it fixed preserves Keychain continuity).
- Deployment target: iOS 17+.
- No WebView and no Cloudflare/Linux backend code.
- No AutoFill extension in MVP because third-party signing may not preserve App Group entitlements.
- No cloud sync, online sharing, server-assisted Passkey, Admin, accounts, or remote recovery.

## MVP functionality
- Master-password setup, unlock and change.
- Optional Face ID / device-owner quick unlock backed by Keychain.
- Local encrypted vault supporting account, website, secure note, TOTP, custom record and encrypted attachment records.
- Editable custom fields, tags, group, favorite, pin, recent-opened state and Trash.
- Local search, password generator, TOTP generation, attachment import/export/preview where iOS supports it.
- Encrypted backup export/import.
- Auto-lock, privacy shield, secret-hidden-by-default and timed clipboard clearing.
- Adaptive iPhone/iPad SwiftUI UI.

## Security design
- A random 256-bit vault key encrypts the vault payload using AES-GCM.
- The master password derives a wrapping key using PBKDF2-HMAC-SHA256 with a random salt and versioned work factor.
- The wrapped vault key, KDF parameters and encrypted payload are stored locally; plaintext secrets are never written to disk.
- Quick unlock stores only a device-protected wrapped vault key in Keychain and requires user presence.
- Lock/background paths zero or release in-memory key/plaintext references and cover the UI.
- Backups remain encrypted and authenticated; malformed or downgraded envelopes fail closed.

## Stack and structure
- Swift 6, SwiftUI, CryptoKit, Security, LocalAuthentication, SQLite3.
- `App/` application lifecycle and navigation.
- `Core/` models, crypto, TOTP, backup, password generation.
- `Storage/` encrypted store and Keychain adapter.
- `Features/` SwiftUI feature modules.
- `PassVaultTests/` unit/integration tests.
- `.github/workflows/ios.yml` macOS build/test/unsigned IPA pipeline.

## Commands
- Generate project: `brew install xcodegen && xcodegen generate`
- Test: `xcodebuild test -project PassVault.xcodeproj -scheme PassVault -destination 'platform=iOS Simulator,name=iPhone 16 Pro' CODE_SIGNING_ALLOWED=NO`
- Archive: `xcodebuild archive -project PassVault.xcodeproj -scheme PassVault -archivePath build/PassVault.xcarchive -sdk iphoneos CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO AD_HOC_CODE_SIGNING_ALLOWED=NO`
- Package unsigned IPA: `bash scripts/package-unsigned-ipa.sh`

## Boundaries
### Always
- TDD for crypto, persistence, backup, TOTP and validation.
- Keep secrets encrypted at rest and hidden in UI by default.
- Build/test on GitHub macOS before claiming an artifact works.
- Upload SHA256 beside every IPA.

### Ask first
- Add server/network access, analytics, telemetry, cloud synchronization, AutoFill extension or paid services.
- Change backup compatibility identity.

### Never
- Commit signing certificates, provisioning profiles, passwords or real vault data.
- Depend on Pass Vault Cloudflare/Linux services.
- Claim an unsigned IPA is directly installable without re-signing.

## Success criteria
- Fresh setup → lock → master-password unlock → CRUD each record type → restart persistence works.
- Wrong password and tampered data fail without plaintext leakage or data loss.
- Face ID quick unlock can be enabled/disabled without becoming the sole recovery method.
- TOTP matches RFC 6238 vectors.
- Encrypted backup round-trip and rejection tests pass.
- GitHub Actions tests succeed and emits an arm64 unsigned IPA plus matching SHA256.
- Repository remains private.
