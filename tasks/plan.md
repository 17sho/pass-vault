# Implementation Plan

1. **Project and crypto tracer bullet**
   - Generate an iOS 17 SwiftUI project with XcodeGen.
   - RED→GREEN tests for models, PBKDF2 key wrapping, AES-GCM payload encryption and RFC 6238 TOTP.
2. **Durable encrypted store**
   - RED→GREEN restart, wrong-password, tamper and atomic-write tests.
   - Versioned local envelope and encrypted backup contract.
3. **Core vault UI**
   - Setup/unlock shell, vault list/detail/editor, CRUD for all MVP types, search/filter/trash.
4. **Security and device integration**
   - Keychain + LocalAuthentication quick unlock, auto-lock, privacy overlay, clipboard timeout.
5. **Attachments and backup**
   - Encrypted attachment records, document import/export and backup recovery UI.
6. **CI and artifact**
   - macOS simulator tests, unsigned device archive, IPA packaging, SHA256 and private artifacts.
7. **Final verification**
   - Requirement/evidence matrix, independent review, clean rebuild and artifact readback.

## Risk order
1. Unsigned device archive packaging on current GitHub Xcode image.
2. Password KDF availability/performance and compatibility.
3. Keychain/Face ID behavior under re-signing and Bundle ID changes.
4. Large attachment memory pressure.

## Mitigations
- Prove CI archive packaging in the first vertical slice.
- Keep bundle ID fixed and master password as permanent recovery path.
- Apply conservative attachment limits and authenticated streaming/chunk strategy if profiling requires it.
