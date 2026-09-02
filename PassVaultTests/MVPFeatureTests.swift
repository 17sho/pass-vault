import CryptoKit
import Foundation
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import PassVault

private struct DisabledQuickUnlockStore: QuickUnlockStoring {
    var isEnabled: Bool { false }
    func enable(vaultKeyData: Data) throws {}
    func disable() throws {}
    func retrieve(reason: String) async throws -> Data { throw QuickUnlockError.unavailable }
}

final class MVPFeatureTests: XCTestCase {
    private func temporaryURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    func testBackupPreflightReturnsSummaryWithoutReplacingDestination() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var sourceSession = try source.create(password: "source-password")
        sourceSession.vault.items = [
            VaultItem(kind: .secureNote, title: "Note"),
            VaultItem(kind: .attachment, title: "File", attachmentName: "a.txt", attachmentData: Data("hello".utf8))
        ]
        try source.save(sourceSession)
        let backup = try source.exportBackup()

        let destinationURL = temporaryURL()
        let destination = EncryptedVaultStore(url: destinationURL, kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")
        let before = try Data(contentsOf: destinationURL)

        let preview = try destination.previewBackup(backup, password: "source-password")

        XCTAssertEqual(preview.recordCount, 2)
        XCTAssertEqual(preview.attachmentCount, 1)
        XCTAssertEqual(preview.attachmentBytes, 5)
        XCTAssertEqual(try Data(contentsOf: destinationURL), before)
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testEncryptedBackupRoundTripAndTamperRejection() throws {
        let sourceURL = temporaryURL()
        let destinationURL = temporaryURL()
        let source = EncryptedVaultStore(url: sourceURL, kdfIterations: 1_000)
        var session = try source.create(password: "master-password")
        session.vault.items = [VaultItem(kind: .secureNote, title: "Recovery", notes: "secret")]
        try source.save(session)

        let backup = try source.exportBackup()
        let destination = EncryptedVaultStore(url: destinationURL, kdfIterations: 1_000)
        try destination.importBackup(backup, password: "master-password")
        XCTAssertEqual(try destination.unlock(password: "master-password").vault.items.first?.notes, "secret")

        var tampered = backup
        tampered[tampered.index(before: tampered.endIndex)] ^= 1
        XCTAssertThrowsError(try destination.importBackup(tampered, password: "master-password"))
        XCTAssertEqual(try destination.unlock(password: "master-password").vault.items.first?.notes, "secret")
    }

    func testImportedSessionRetainsWrappedKeyForSubsequentSave() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var sourceSession = try source.create(password: "master-password")
        sourceSession.vault.items = [VaultItem(title: "Imported")]
        try source.save(sourceSession)
        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var imported = try destination.importBackupSession(source.exportBackup(), password: "master-password")
        imported.vault.items.append(VaultItem(title: "Saved after import"))
        try destination.save(imported)
        XCTAssertEqual(try destination.unlock(password: "master-password").vault.items.count, 2)
    }

    func testRecordsOnlyBackupExcludesAttachmentPayloads() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var session = try source.create(password: "master-password")
        session.vault.items = [VaultItem(title: "Record"), VaultItem(kind: .attachment, title: "photo.png", attachmentName: "photo.png", attachmentData: Data([1, 2, 3]))]
        try source.save(session)
        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        try destination.importBackup(source.exportBackup(session: session, scope: .recordsOnly), password: "master-password")
        XCTAssertEqual(try destination.unlock(password: "master-password").vault.items.map(\.kind), [.account])
    }

    func testBackupRejectsDowngradeAndWrongPasswordWithoutReplacingVault() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try source.create(password: "correct-password")
        var document = try JSONDecoder().decode(EncryptedBackupDocument.self, from: source.exportBackup())
        document.version = 0

        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")
        XCTAssertThrowsError(try destination.importBackup(JSONEncoder().encode(document), password: "correct-password"))
        XCTAssertThrowsError(try destination.importBackup(source.exportBackup(), password: "wrong-password"))
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testAttachmentPreviewPolicyAllowsOnlySafeSniffedTypes() {
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "note.txt", data: Data("hello".utf8)), .text)
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "report.pdf", data: Data("%PDF-1.7".utf8)), .pdf)
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "photo.png", data: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), .image)
        XCTAssertNil(AttachmentPreviewPolicy.previewKind(name: "fake.png", data: Data("<script>alert(1)</script>".utf8)))
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "page.html", data: Data("<html></html>".utf8)), .text)
    }

    func testAttachmentPolicyUsesConservativePerFileAndTotalLimits() throws {
        XCTAssertNoThrow(try AttachmentPolicy.validate(newDataSize: AttachmentPolicy.maximumFileBytes, existingBytes: 0))
        XCTAssertThrowsError(try AttachmentPolicy.validate(newDataSize: AttachmentPolicy.maximumFileBytes + 1, existingBytes: 0))
        XCTAssertThrowsError(try AttachmentPolicy.validate(newDataSize: 1, existingBytes: AttachmentPolicy.maximumVaultBytes))
    }

    func testBackupDataOverHardLimitIsRejectedWithoutReplacingVault() throws {
        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")

        XCTAssertThrowsError(try destination.importBackup(Data(count: BackupPolicy.maximumBackupBytes + 1), password: "password"))
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testBackupWithOversizedDecryptedAttachmentIsRejectedWithoutReplacingVault() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var sourceSession = try source.create(password: "source-password")
        sourceSession.vault.items = [VaultItem(kind: .attachment, title: "oversized", attachmentData: Data(count: AttachmentPolicy.maximumFileBytes + 1))]
        try source.save(sourceSession)

        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")
        XCTAssertThrowsError(try destination.importBackup(source.exportBackup(), password: "source-password"))
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testBackupWithExcessiveDecryptedAttachmentTotalIsRejectedWithoutReplacingVault() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var sourceSession = try source.create(password: "source-password")
        sourceSession.vault.items = [9, 9, 8].enumerated().map { index, megabytes in
            VaultItem(kind: .attachment, title: "file-\(index)", attachmentData: Data(count: megabytes * 1_024 * 1_024))
        }
        try source.save(sourceSession)

        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")
        XCTAssertThrowsError(try destination.importBackup(source.exportBackup(), password: "source-password"))
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testFileReadPolicyRejectsOversizedFileBeforeLoadingContents() throws {
        let url = temporaryURL()
        XCTAssertTrue(FileManager.default.createFile(atPath: url.path, contents: nil))
        let handle = try FileHandle(forWritingTo: url)
        try handle.truncate(atOffset: UInt64(AttachmentPolicy.maximumFileBytes + 1))
        try handle.close()

        XCTAssertThrowsError(try FileReadPolicy.validateRegularFile(at: url, maximumBytes: AttachmentPolicy.maximumFileBytes))
    }

    func testStoredVaultReadRejectsOversizedFileBeforeDecode() throws {
        let url = temporaryURL()
        XCTAssertTrue(FileManager.default.createFile(atPath: url.path, contents: nil))
        let handle = try FileHandle(forWritingTo: url)
        try handle.truncate(atOffset: UInt64(BackupPolicy.maximumBackupBytes + 1))
        try handle.close()

        XCTAssertThrowsError(try EncryptedVaultStore(url: url, kdfIterations: 1_000).unlock(password: "password")) { error in
            XCTAssertEqual(error as? BackupPolicyError, .fileTooLarge)
        }
    }

    func testAutoLockPolicyLocksAfterBackgroundDeadlineAndReschedulesBeforeIt() {
        let backgroundedAt = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(AutoLockPolicy.action(backgroundedAt: backgroundedAt, now: backgroundedAt.addingTimeInterval(60), timeout: 60), .lock)
        switch AutoLockPolicy.action(backgroundedAt: backgroundedAt, now: backgroundedAt.addingTimeInterval(10), timeout: 60) {
        case .schedule(let delay): XCTAssertEqual(delay, 50, accuracy: 0.001)
        case .lock: XCTFail("Expected the active vault to retain the remaining auto-lock interval")
        }
    }

    @MainActor
    func testUnlockedVaultAutoLocksAfterForegroundInactivity() async throws {
        let model = AppModel(
            store: EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000),
            quickUnlock: DisabledQuickUnlockStore()
        )
        model.autoLockSeconds = 0.05
        model.setup(password: "master-password")
        XCTAssertEqual(model.state, .unlocked)

        try await Task.sleep(for: .milliseconds(120))

        XCTAssertEqual(model.state, .locked)
    }

    @MainActor
    func testForegroundActivityResetsAutoLockDeadline() async throws {
        let model = AppModel(
            store: EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000),
            quickUnlock: DisabledQuickUnlockStore()
        )
        model.autoLockSeconds = 0.08
        model.setup(password: "master-password")
        try await Task.sleep(for: .milliseconds(45))
        model.recordActivity()
        try await Task.sleep(for: .milliseconds(45))
        XCTAssertEqual(model.state, .unlocked)
        try await Task.sleep(for: .milliseconds(60))
        XCTAssertEqual(model.state, .locked)
    }

    @MainActor
    func testUnlockedVaultDoesNotLockDuringTransientInactivePhase() async throws {
        let model = AppModel(
            store: EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000),
            quickUnlock: DisabledQuickUnlockStore()
        )
        model.autoLockSeconds = 0.05
        model.setup(password: "master-password")

        model.sceneDidChange(to: .inactive)
        try await Task.sleep(for: .milliseconds(120))

        XCTAssertEqual(model.state, .unlocked, "Notification Center, system prompts, and brief interruptions must shield without starting the background lock deadline")
        XCTAssertTrue(model.privacyShielded)
    }

    @MainActor
    func testUnlockedVaultLocksAfterBackgroundTimeout() async throws {
        let model = AppModel(
            store: EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000),
            quickUnlock: DisabledQuickUnlockStore()
        )
        model.autoLockSeconds = 0.05
        model.setup(password: "master-password")

        model.sceneDidChange(to: .background)
        try await Task.sleep(for: .milliseconds(120))

        XCTAssertEqual(model.state, .locked)
    }

    func testAttachmentDocumentUsesGenericDataTypeIndependentOfBackupDocument() {
        XCTAssertEqual(AttachmentDocument.readableContentTypes, [.data])
        XCTAssertNotEqual(AttachmentDocument.readableContentTypes, BackupDocument.readableContentTypes)
    }

    func testSensitiveContentIsSynchronouslyRemovedAtLockBoundary() {
        XCTAssertTrue(SensitiveContentPolicy.mayRenderVault(state: .unlocked))
        XCTAssertFalse(SensitiveContentPolicy.mayRenderVault(state: .locked))
        XCTAssertFalse(SensitiveContentPolicy.shouldShield(state: .locked, privacyShielded: false))
        XCTAssertTrue(SensitiveContentPolicy.shouldShield(state: .unlocked, privacyShielded: true))
    }

    func testQuickUnlockCompletionMustMatchCurrentLockGenerationAndScene() {
        XCTAssertTrue(QuickUnlockCommitPolicy.mayCommit(startGeneration: 3, currentGeneration: 3, state: .locked, sceneAllowsUnlock: true, cancelled: false))
        XCTAssertFalse(QuickUnlockCommitPolicy.mayCommit(startGeneration: 3, currentGeneration: 4, state: .locked, sceneAllowsUnlock: true, cancelled: false))
        XCTAssertFalse(QuickUnlockCommitPolicy.mayCommit(startGeneration: 3, currentGeneration: 3, state: .unlocked, sceneAllowsUnlock: true, cancelled: false))
        XCTAssertFalse(QuickUnlockCommitPolicy.mayCommit(startGeneration: 3, currentGeneration: 3, state: .locked, sceneAllowsUnlock: false, cancelled: false))
        XCTAssertFalse(QuickUnlockCommitPolicy.mayCommit(startGeneration: 3, currentGeneration: 3, state: .locked, sceneAllowsUnlock: true, cancelled: true))
    }

    func testAuthenticationTransitionUsesGateExitThenSingleVaultEntry() {
        XCTAssertEqual(
            AuthenticationTransitionPlan.plan(reduceMotion: false),
            [.gateExit, .vaultEntry]
        )
    }

    func testAuthenticationTransitionSkipsTransientStagesForReducedMotion() {
        XCTAssertEqual(AuthenticationTransitionPlan.plan(reduceMotion: true), [.immediate])
    }

    func testAuthenticationPresentationCanBeginOnlyOncePerGateCycle() {
        var presentation = AuthenticationPresentationPolicy()

        XCTAssertEqual(presentation.begin(reduceMotion: false), [.gateExit, .vaultEntry])
        XCTAssertEqual(presentation.begin(reduceMotion: false), [])
        XCTAssertEqual(presentation.transitionCount, 1)
        XCTAssertEqual(presentation.phase, .gateExit)

        presentation.showVaultEntry()
        XCTAssertEqual(presentation.phase, .vaultEntry)
        presentation.finish()
        XCTAssertEqual(presentation.phase, .vault)
    }

    func testReducedMotionPresentationCommitsStableVaultImmediately() {
        var presentation = AuthenticationPresentationPolicy()

        XCTAssertEqual(presentation.begin(reduceMotion: true), [.immediate])
        XCTAssertEqual(presentation.phase, .vault)
        XCTAssertEqual(presentation.transitionCount, 1)
    }

    func testClipboardPolicyUsesLocalOnlyAndExpirationDate() {
        let expiration = Date(timeIntervalSince1970: 1_030)
        let options = ClipboardPolicy.options(expirationDate: expiration)
        XCTAssertEqual(options[.localOnly] as? Bool, true)
        XCTAssertEqual(options[.expirationDate] as? Date, expiration)
    }

    func testBackupWithEmptyAttachmentIsRejectedWithoutReplacingVault() throws {
        let source = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var sourceSession = try source.create(password: "source-password")
        sourceSession.vault.items = [VaultItem(kind: .attachment, title: "empty", attachmentData: Data())]
        try source.save(sourceSession)

        let destination = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        _ = try destination.create(password: "existing-password")
        XCTAssertThrowsError(try destination.importBackup(source.exportBackup(), password: "source-password"))
        XCTAssertNoThrow(try destination.unlock(password: "existing-password"))
    }

    func testSearchIncludesFieldsTagsGroupAndExcludesTrashByDefault() {
        let active = VaultItem(title: "Bank", username: "alice", customFields: [CustomField(name: "Branch", value: "Oslo")], tags: ["finance"], group: "Personal")
        var deleted = VaultItem(title: "Deleted match")
        deleted.isDeleted = true
        let vault = Vault(items: [active, deleted])
        XCTAssertEqual(vault.search("oslo").map(\.id), [active.id])
        XCTAssertEqual(vault.search("finance").map(\.id), [active.id])
        XCTAssertTrue(vault.search("deleted").isEmpty)
        XCTAssertEqual(vault.search("deleted", includeDeleted: true).map(\.id), [deleted.id])
    }

    func testPasswordGeneratorHonorsLengthAndCharacterClasses() throws {
        let password = try PasswordGenerator.generate(options: .init(length: 24, uppercase: true, lowercase: true, digits: true, symbols: true))
        XCTAssertEqual(password.count, 24)
        XCTAssertTrue(password.contains(where: { $0.isUppercase }))
        XCTAssertTrue(password.contains(where: { $0.isLowercase }))
        XCTAssertTrue(password.contains(where: { $0.isNumber }))
        XCTAssertTrue(password.contains(where: { PasswordGenerator.symbols.contains($0) }))
        XCTAssertThrowsError(try PasswordGenerator.generate(options: .init(length: 11, uppercase: true, lowercase: true, digits: true, symbols: true)))
        XCTAssertThrowsError(try PasswordGenerator.generate(options: .init(length: 65, uppercase: true, lowercase: true, digits: true, symbols: true)))
    }

    func testCredentialEditorTargetsStableRowAndReordersWithoutChangingIdentity() {
        let first = VaultCredential(username: "first", password: "one")
        let second = VaultCredential(username: "second", password: "two")
        var credentials = [first, second]
        XCTAssertTrue(VaultCredentialEditorPolicy.replacePassword("generated", for: first.id, in: &credentials))
        XCTAssertEqual(credentials[0].password, "generated")
        XCTAssertEqual(credentials[1].password, "two")
        XCTAssertTrue(VaultCredentialEditorPolicy.move(first.id, direction: .down, in: &credentials))
        XCTAssertEqual(credentials.map(\.id), [second.id, first.id])
    }

    func testChangePasswordInvalidatesOldPasswordAndPreservesVault() throws {
        let store = EncryptedVaultStore(url: temporaryURL(), kdfIterations: 1_000)
        var session = try store.create(password: "old-password")
        session.vault.items = [VaultItem(title: "Saved", username: "user", password: "secret")]
        try store.save(session)
        _ = try store.changePassword(session: session, newPassword: "new-password")
        XCTAssertThrowsError(try store.unlock(password: "old-password"))
        XCTAssertEqual(try store.unlock(password: "new-password").vault.items.first?.password, "secret")
    }
}
