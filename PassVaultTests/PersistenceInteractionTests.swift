import Foundation
import XCTest
@testable import PassVault

private final class PersistenceInteractionQuickUnlockStore: QuickUnlockStoring, @unchecked Sendable {
    var isEnabled: Bool
    var disableError: Error?
    init(isEnabled: Bool = false, disableError: Error? = nil) { self.isEnabled = isEnabled; self.disableError = disableError }
    func enable(vaultKeyData: Data) throws { isEnabled = true }
    func disable() throws { if let disableError { throw disableError }; isEnabled = false }
    func retrieve(reason: String) async throws -> Data { throw QuickUnlockError.unavailable }
}

@MainActor
final class PersistenceInteractionTests: XCTestCase {
    private let password = "test-password"

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func makeModel() throws -> (model: AppModel, vaultURL: URL) {
        let directory = try temporaryDirectory()
        let vaultURL = directory.appendingPathComponent("vault.pv", isDirectory: false)
        let model = AppModel(
            store: EncryptedVaultStore(url: vaultURL, kdfIterations: 1_000),
            quickUnlock: PersistenceInteractionQuickUnlockStore()
        )
        XCTAssertTrue(model.setup(password: password))
        return (model, vaultURL)
    }

    private func makePersistenceFail(at vaultURL: URL) throws {
        let directory = vaultURL.deletingLastPathComponent()
        try FileManager.default.removeItem(at: directory)
        try Data("not-a-directory".utf8).write(to: directory)
    }

    func testApplyBulkReturnsFalseAndKeepsPublishedVaultUnchangedWhenPersistenceFails() throws {
        let (model, vaultURL) = try makeModel()
        let item = VaultItem(title: "Account")
        XCTAssertTrue(model.save(item))
        try makePersistenceFail(at: vaultURL)

        XCTAssertFalse(model.applyBulk(selectedIDs: [item.id], favorite: true))
        XCTAssertFalse(try XCTUnwrap(model.vault.items.first(where: { $0.id == item.id })).isFavorite)
    }

    func testOrganizationUpdatePersistsAndRollsBackPublishedVaultOnFailure() throws {
        let (model, vaultURL) = try makeModel()
        XCTAssertTrue(model.updateOrganization { $0.tagRegistry.create(name: "工作", colorHex: "2563EB") })
        XCTAssertEqual(model.vault.tagRegistry.tags.map(\.name), ["工作"])

        try makePersistenceFail(at: vaultURL)
        XCTAssertFalse(model.updateOrganization { $0.tagRegistry.create(name: "不应保留") })
        XCTAssertEqual(model.vault.tagRegistry.tags.map(\.name), ["工作"])
    }

    func testBulkGroupAndTagMutationPersistsTogether() throws {
        let (model, _) = try makeModel()
        let item = VaultItem(kind: .account, title: "Account", tags: ["旧"])
        XCTAssertTrue(model.save(item))
        XCTAssertTrue(model.updateOrganization { $0.groupRegistry.create(name: "工作", kind: .account) })
        let groupID = try XCTUnwrap(model.vault.groupRegistry.groups(for: .account).first?.id.uuidString)

        XCTAssertTrue(model.applyBulk(
            selectedIDs: [item.id],
            group: groupID,
            addTags: ["工作"],
            removeTags: ["旧"]
        ))
        let saved = try XCTUnwrap(model.vault.items.first(where: { $0.id == item.id }))
        XCTAssertEqual(saved.group, groupID)
        XCTAssertEqual(saved.tags, ["工作"])
    }

    func testMixedKindBulkDefaultGroupIsRejectedWithoutMutation() throws {
        let (model, _) = try makeModel()
        let account = VaultItem(kind: .account, title: "Account", group: "账号组")
        let note = VaultItem(kind: .secureNote, title: "Note", group: "笔记组")
        XCTAssertTrue(model.save(account)); XCTAssertTrue(model.save(note))
        let before = Dictionary(uniqueKeysWithValues: model.vault.items.map { ($0.id, $0.group) })
        XCTAssertFalse(model.applyBulk(selectedIDs: [account.id, note.id], group: ""))
        XCTAssertEqual(Dictionary(uniqueKeysWithValues: model.vault.items.map { ($0.id, $0.group) }), before)
    }

    func testInvalidTagsAreRejectedWithoutClearingExistingTags() throws {
        let (model, _) = try makeModel()
        let item = VaultItem(title: "Account", tags: ["工作"])
        XCTAssertTrue(model.save(item))
        var invalid = item; invalid.tags = [String(repeating: "x", count: TagPolicy.maximumNameLength + 1)]
        XCTAssertFalse(model.save(invalid))
        XCTAssertEqual(model.vault.items.first(where: { $0.id == item.id })?.tags, ["工作"])
    }

    func testDirectUnpinRemovesStalePinnedOrder() throws {
        let (model, _) = try makeModel()
        var item = VaultItem(title: "Pinned", isPinned: true)
        XCTAssertTrue(model.save(item))
        XCTAssertEqual(model.vault.pinnedOrder.order(for: .account), [item.id])
        item.isPinned = false
        XCTAssertTrue(model.save(item))
        XCTAssertFalse(model.vault.pinnedOrder.order(for: .account).contains(item.id))
    }

    func testPinnedOrderUpdatePersistsAcrossUnlock() throws {
        let (model, vaultURL) = try makeModel()
        let first = VaultItem(kind: .account, title: "A", isPinned: true)
        let second = VaultItem(kind: .account, title: "B", isPinned: true)
        XCTAssertTrue(model.save(first)); XCTAssertTrue(model.save(second))
        XCTAssertTrue(model.updateOrganization { $0.pinnedOrder.setOrder([second.id, first.id], for: .account) })

        let reopened = AppModel(store: EncryptedVaultStore(url: vaultURL, kdfIterations: 1_000), quickUnlock: PersistenceInteractionQuickUnlockStore())
        XCTAssertTrue(reopened.unlock(password: password))
        XCTAssertEqual(reopened.vault.pinnedOrder.order(for: .account), [second.id, first.id])
    }

    func testMoveToTrashReturnsFalseAndKeepsItemActiveWhenPersistenceFails() throws {
        let (model, vaultURL) = try makeModel()
        let item = VaultItem(title: "Account")
        XCTAssertTrue(model.save(item))
        try makePersistenceFail(at: vaultURL)

        XCTAssertFalse(model.moveToTrash(item))
        XCTAssertFalse(try XCTUnwrap(model.vault.items.first(where: { $0.id == item.id })).isDeleted)
    }

    func testDeletePermanentlyReturnsFalseAndKeepsItemWhenPersistenceFails() throws {
        let (model, vaultURL) = try makeModel()
        let item = VaultItem(title: "Account")
        XCTAssertTrue(model.save(item))
        try makePersistenceFail(at: vaultURL)

        XCTAssertFalse(model.deletePermanently(ids: [item.id]))
        XCTAssertNotNil(model.vault.items.first(where: { $0.id == item.id }))
    }

    func testEmptyTrashReturnsFalseAndKeepsTrashWhenPersistenceFails() throws {
        let (model, vaultURL) = try makeModel()
        var item = VaultItem(title: "Deleted")
        item.moveToTrash()
        XCTAssertTrue(model.save(item))
        try makePersistenceFail(at: vaultURL)

        XCTAssertFalse(model.emptyTrash())
        XCTAssertNotNil(model.vault.items.first(where: { $0.id == item.id }))
    }

    func testImportBackupReportsFailureWithoutClearingCurrentVaultState() throws {
        let (model, _) = try makeModel()
        let item = VaultItem(title: "Current")
        XCTAssertTrue(model.save(item))

        XCTAssertEqual(model.importBackup(Data("invalid-backup".utf8), password: password), .rejected)
        XCTAssertEqual(model.vault.items.map(\.id), [item.id])
    }

    func testImportBackupReturnsTrueAfterReplacementIsLoaded() throws {
        let sourceDirectory = try temporaryDirectory()
        let sourceStore = EncryptedVaultStore(
            url: sourceDirectory.appendingPathComponent("source.pv"),
            kdfIterations: 1_000
        )
        var sourceSession = try sourceStore.create(password: password)
        sourceSession.vault.items = [VaultItem(title: "Imported")]
        try sourceStore.save(sourceSession)
        let backup = try sourceStore.exportBackup()
        let (model, _) = try makeModel()

        XCTAssertEqual(model.importBackup(backup, password: password), .imported)
        XCTAssertEqual(model.vault.items.map(\.title), ["Imported"])
    }

    func testCommittedBackupImportReturnsDegradedSuccessWhenQuickUnlockCleanupFails() throws {
        struct DisableFailure: Error {}
        let sourceStore = EncryptedVaultStore(url: try temporaryDirectory().appendingPathComponent("source.pv"), kdfIterations: 1_000)
        var source = try sourceStore.create(password: password)
        source.vault.items = [VaultItem(title: "Imported")]
        try sourceStore.save(source)
        let backup = try sourceStore.exportBackup()
        let quickUnlock = PersistenceInteractionQuickUnlockStore(isEnabled: true, disableError: DisableFailure())
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let preferences = LocalVaultPreferences(defaults: defaults)
        preferences.quickUnlockOptIn = true
        let model = AppModel(store: EncryptedVaultStore(url: try temporaryDirectory().appendingPathComponent("vault.pv"), kdfIterations: 1_000), quickUnlock: quickUnlock, preferences: preferences)
        XCTAssertTrue(model.setup(password: password))

        XCTAssertEqual(model.importBackup(backup, password: password), .importedQuickUnlockCleanupFailed)
        XCTAssertEqual(model.state, .locked)
        XCTAssertTrue(model.vault.items.isEmpty)
        XCTAssertTrue(quickUnlock.isEnabled)
        XCTAssertTrue(model.quickUnlockEnabled)
        XCTAssertTrue(model.unlock(password: password))
        XCTAssertEqual(model.vault.items.map(\.title), ["Imported"])
    }
}
