# Pass Vault iOS

Native SwiftUI, local-only encrypted password vault for iOS 17+. The local MVP includes master-password setup/unlock/change, optional Keychain user-presence quick unlock, AES-GCM encrypted versioned storage and backups, RFC 6238 TOTP, all record types, search/favorites/pins/recent/trash, password generation, encrypted attachments, and adaptive iPhone/iPad navigation.

## Generate and test (macOS)

```bash
brew install xcodegen
xcodegen generate
xcodebuild test -project PassVault.xcodeproj -scheme PassVault \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' CODE_SIGNING_ALLOWED=NO
```

## Unsigned IPA

GitHub Actions archives an arm64 `iphoneos` application without signing, packages `Payload/PassVault.app` into `PassVault-unsigned.ipa`, and uploads a SHA-256 checksum. The IPA **must be re-signed** with a valid certificate/profile before installation.

No signing identities, provisioning profiles, backend, analytics, or network service are required.

## Security scope

- Random 256-bit vault key; AES-GCM authenticated encryption.
- PBKDF2-HMAC-SHA256 master-password wrapping with random salt and versioned work factor.
- Atomic file writes with complete file protection.
- Secrets hidden in the editor by default; privacy shield appears immediately off-active and automatic lock follows after 60 seconds.
- Clipboard auto-clear is configurable in Settings: never, 15 seconds, 30 seconds, 1 minute, or 2 minutes; newer clipboard content is never removed.
- Attachments remain inside the encrypted payload; practical capacity depends on available device storage.
- Versioned authenticated backup import validates fully before replacing the local vault.

## Local build limitation

The iOS app and XCTest bundle require macOS/Xcode. Linux cannot execute the Swift/iOS test suite; the GitHub Actions macOS workflow remains the authoritative build/test/archive gate.
