# Agent Guide

## Product boundary

Pass Vault is a native SwiftUI, local-only encrypted vault for iOS 17+. Preserve the encrypted on-device storage and Keychain identifiers. Do not add a backend, analytics, telemetry, remote synchronization, or production deployment configuration without explicit authorization.

## Build and test

The authoritative toolchain is macOS/Xcode:

```bash
brew install xcodegen
xcodegen generate
xcodebuild test -project PassVault.xcodeproj -scheme PassVault \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' CODE_SIGNING_ALLOWED=NO
```

For an unsigned device artifact, archive `iphoneos` for `arm64` with code signing disabled, package `Payload/PassVault.app`, and verify the resulting IPA. The repository workflow `.github/workflows/ios.yml` implements the canonical XCTest → Release Archive → IPA → SHA-256 chain.

Linux-side text checks are static evidence only; they do not prove Swift compilation, XCTest, Archive, signing state, or device behavior.

## Security rules

- Never commit passwords, API tokens, signing identities, provisioning profiles, production vaults, database exports, or real user fixtures.
- Keep secrets masked by default, including accessibility labels and values.
- Keep the app-switcher privacy shield above all product-owned overlays.
- Validate and authenticate an imported backup completely before replacing the current vault.
- Preserve `pass-vault-v2` compatibility identifiers used by the web backup format.
- Keep attachment payloads inside the authenticated encrypted vault and preserve quota checks.
- Do not weaken PBKDF2/AES-GCM parameters or Keychain user-presence policy without a reviewed migration.

## UI and interaction conventions

- Product-owned windows, selectors, confirmations, and menus must remain custom SwiftUI surfaces; system UI is reserved for platform boundaries such as Files, photos/camera, sharing, permissions, and LocalAuthentication.
- App-owned windows must not use bottom-up sheet motion. Back pops one product level; Close clears the product route stack.
- Mutable state for content stored by the root `AnyView` overlay host must live in the hosted child view and commit through callbacks.
- Keep touch targets at least 44×44 pt and avoid gestures that compete with descendant `ScrollView` gestures.
- Support Simplified Chinese and English for user-facing text.
- Treat physical-device feedback as authoritative when it contradicts simulator tests.

## Change discipline

1. Add or update focused regression coverage for behavior changes.
2. Run `git diff --check` and the real hosted Xcode workflow.
3. Keep generated output (`build/`, `DerivedData/`, `delivery/`, `release/`, `*.ipa`) out of Git.
4. Do not claim visual or hardware acceptance from source-string contracts or aggregate XCTest alone.
5. Before publishing an IPA, verify Bundle ID, `arm64`, signing/provisioning absence for unsigned builds, test-bundle exclusion, and SHA-256.
