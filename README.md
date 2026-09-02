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
- Clipboard copies clear after 30 seconds when the clipboard still contains the app-owned value.
- Attachments remain inside the encrypted payload (10 MB each, 25 MB total).
- Versioned authenticated backup import validates fully before replacing the local vault.

## Local build limitation

The iOS app and XCTest bundle require macOS/Xcode. Linux cannot execute the Swift/iOS test suite; the GitHub Actions macOS workflow remains the authoritative build/test/archive gate.


## Included IPA

This branch includes `PassVault-unsigned-arm64.ipa`, built from the exact source commit represented by this branch.

- Architecture: arm64
- Bundle ID: `me.23cm.passvault.local`
- Signing: unsigned; re-sign with your own certificate and provisioning profile before installation
- Verification: 220/220 XCTest plus Release `iphoneos` Archive
- Integrity: run `sha256sum -c SHA256SUMS`

The web application remains on the repository's `main` branch. This orphan branch contains only the native iOS project and has independent history.
