import Foundation
import SwiftUI
import UIKit

enum SensitiveContentPolicy {
    static func mayRenderVault(state: AppModel.State) -> Bool { state == .unlocked }
    static func shouldShield(state: AppModel.State, privacyShielded: Bool) -> Bool {
        privacyShielded
    }
}

enum QuickUnlockCommitPolicy {
    static func mayCommit(startGeneration: UInt64, currentGeneration: UInt64, state: AppModel.State, sceneAllowsUnlock: Bool, cancelled: Bool) -> Bool {
        !cancelled && sceneAllowsUnlock && state == .locked && startGeneration == currentGeneration
    }
}

enum AutoLockAction: Equatable {
    case lock
    case schedule(after: TimeInterval)
}

enum AutoLockPolicy {
    static func action(backgroundedAt: Date, now: Date, timeout: TimeInterval) -> AutoLockAction {
        let remaining = timeout - now.timeIntervalSince(backgroundedAt)
        return remaining <= 0 ? .lock : .schedule(after: remaining)
    }
}

enum ClipboardPolicy {
    static func options(expirationDate: Date) -> [UIPasteboard.OptionsKey: Any] {
        [.localOnly: true, .expirationDate: expirationDate]
    }
}

enum BackupImportResult: Equatable {
    case rejected
    case imported
    case importedQuickUnlockCleanupFailed

    var didReplaceVault: Bool { self != .rejected }
}

@MainActor
final class AppModel: ObservableObject {
    enum State: Equatable { case needsSetup, locked, unlocked }
    @Published private(set) var state: State
    @Published private(set) var vault = Vault()
    @Published private(set) var quickUnlockEnabled: Bool
    @Published private(set) var lastSaveSucceeded: Bool?
    @Published var privacyShielded = false
    @Published var errorMessage: String?
    @Published var noticeMessage: String?

    private let store: EncryptedVaultStore
    private let quickUnlock: QuickUnlockStoring
    private let languageStore: AppLanguageStore
    let preferences: LocalVaultPreferences

    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }
    private var session: VaultSession?
    private var lockTask: Task<Void, Never>?
    private var clipboardTask: Task<Void, Never>?
    private var clipboardChangeCount: Int?
    private var backgroundedAt: Date?
    private var lockGeneration: UInt64 = 0
    private var sceneAllowsQuickUnlock = true
    private var quickUnlockInProgress = false
    private var autoLockOverride: TimeInterval?
    var autoLockSeconds: TimeInterval {
        get { autoLockOverride ?? preferences.autoLockChoice.seconds }
        set { autoLockOverride = newValue }
    }

    init(store: EncryptedVaultStore, quickUnlock: QuickUnlockStoring = KeychainQuickUnlockStore(), languageStore: AppLanguageStore = AppLanguageStore(), preferences: LocalVaultPreferences = LocalVaultPreferences()) {
        self.store = store; self.quickUnlock = quickUnlock; self.languageStore = languageStore; self.preferences = preferences
        state = store.exists ? .locked : .needsSetup
        quickUnlockEnabled = preferences.quickUnlockOptIn && quickUnlock.isEnabled
    }

    static func live(languageStore: AppLanguageStore, preferences: LocalVaultPreferences) -> AppModel {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return AppModel(store: EncryptedVaultStore(url: root.appendingPathComponent("vault.pv", isDirectory: false)), languageStore: languageStore, preferences: preferences)
    }

    func setup(password: String) -> Bool {
        guard password.count >= 8 else { errorMessage = t(.useAtLeast8); return false }
        let succeeded = perform { try store.create(password: password) }
        if succeeded { recordActivity() }
        return succeeded
    }

    func unlock(password: String) -> Bool {
        let succeeded = perform { try store.unlock(password: password) }
        if succeeded { recordActivity() }
        return succeeded
    }

    func recordActivity() {
        guard state == .unlocked, autoLockSeconds > 0, sceneAllowsQuickUnlock else { return }
        backgroundedAt = nil
        scheduleLock(after: autoLockSeconds)
    }

    func quickUnlockNow() async {
        let generation = lockGeneration
        guard quickUnlockEnabled, preferences.quickUnlockOptIn, state == .locked, sceneAllowsQuickUnlock else { return }
        quickUnlockInProgress = true
        defer { quickUnlockInProgress = false }
        do {
            var key = try await quickUnlock.retrieve(reason: t(.quickUnlockReason))
            defer { key.resetBytes(in: key.startIndex..<key.endIndex) }
            guard QuickUnlockCommitPolicy.mayCommit(
                startGeneration: generation,
                currentGeneration: lockGeneration,
                state: state,
                sceneAllowsUnlock: sceneAllowsQuickUnlock,
                cancelled: Task.isCancelled
            ) else { return }
            if perform({ try store.unlock(vaultKeyData: key) }) { recordActivity() }
        } catch is CancellationError {
            return
        } catch {
            guard generation == lockGeneration, state == .locked, sceneAllowsQuickUnlock else { return }
            errorMessage = t(.quickUnlockFailed)
        }
    }

    @discardableResult
    private func perform(_ operation: () throws -> VaultSession) -> Bool {
        do {
            var opened = try operation()
            let originalVault = opened.vault
            opened.vault.normalizeOrganizationReferences()
            if opened.vault != originalVault { try store.save(opened) }
            session = opened; vault = opened.vault
            state = .unlocked; privacyShielded = false; errorMessage = nil
            lockTask?.cancel(); lockTask = nil
            backgroundedAt = nil
            _ = purgeExpiredTrash()
            return true
        } catch {
            errorMessage = t(.unableOpenVault)
            return false
        }
    }

    func lock() {
        lockGeneration &+= 1
        lockTask?.cancel(); lockTask = nil
        clearClipboardIfOwned()
        backgroundedAt = nil
        // Keep the non-secret shield asserted through the synchronous state boundary.
        privacyShielded = true
        session = nil; vault = Vault(); state = store.exists ? .locked : .needsSetup
    }

    func sceneDidChange(to phase: ScenePhase) {
        switch phase {
        case .active:
            sceneAllowsQuickUnlock = true
            privacyShielded = false
            lockTask?.cancel(); lockTask = nil
            guard state == .unlocked else { backgroundedAt = nil; return }
            guard autoLockSeconds > 0 else { backgroundedAt = nil; return }
            if let backgroundedAt {
                switch AutoLockPolicy.action(backgroundedAt: backgroundedAt, now: Date(), timeout: autoLockSeconds) {
                case .lock: lock()
                case .schedule:
                    self.backgroundedAt = nil
                }
            }
            recordActivity()
        case .inactive:
            guard !quickUnlockInProgress else { return }
            sceneAllowsQuickUnlock = false
            lockGeneration &+= 1
            privacyShielded = state == .unlocked
            lockTask?.cancel(); lockTask = nil
        case .background:
            sceneAllowsQuickUnlock = false
            lockGeneration &+= 1
            privacyShielded = state == .unlocked
            guard autoLockSeconds > 0 else { backgroundedAt = nil; return }
            if state == .unlocked, backgroundedAt == nil { backgroundedAt = Date() }
            if let backgroundedAt {
                switch AutoLockPolicy.action(backgroundedAt: backgroundedAt, now: Date(), timeout: autoLockSeconds) {
                case .lock: lock()
                case .schedule(let remaining): scheduleLock(after: remaining)
                }
            }
        @unknown default:
            sceneAllowsQuickUnlock = false
            lockGeneration &+= 1
            privacyShielded = true; scheduleLock()
        }
    }

    private func scheduleLock(after delay: TimeInterval? = nil) {
        guard state == .unlocked else { return }
        lockTask?.cancel()
        let delay = delay ?? autoLockSeconds
        guard delay > 0 else { return }
        lockTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.lock()
        }
    }

    @discardableResult
    func save(_ item: VaultItem) -> Bool {
        guard var current = session else { lastSaveSucceeded = false; return false }
        guard TagPolicy.normalizedSelection(item.tags) != nil else {
            errorMessage = t(.unableSaveChanges); lastSaveSucceeded = false; return false
        }
        let previous = current.vault.items.first(where: { $0.id == item.id })
        var saved = item; saved.modifiedAt = Date()
        guard current.vault.upsertAndRegisterOrganization(saved) else {
            errorMessage = t(.unableSaveChanges); lastSaveSucceeded = false; return false
        }
        var order = current.vault.pinnedOrder.order(for: saved.kind)
        if !saved.isPinned {
            order.removeAll { $0 == saved.id }
        } else if previous?.isPinned != true || !order.contains(saved.id) {
            order.removeAll { $0 == saved.id }
            order.append(saved.id)
        }
        current.vault.pinnedOrder.setOrder(order, for: saved.kind)
        let succeeded = persist(current)
        lastSaveSucceeded = succeeded
        return succeeded
    }

    @discardableResult
    func saveCustomFieldTemplate(_ template: CustomFieldTemplate) -> Bool {
        guard var current = session else { return false }
        current.vault.upsertCustomFieldTemplate(template)
        return persist(current)
    }

    @discardableResult
    func updateOrganization(_ mutation: (inout Vault) -> Void) -> Bool {
        guard var current = session else { return false }
        mutation(&current.vault)
        return persist(current)
    }

    @discardableResult
    func deleteCustomFieldTemplate(id: UUID) -> Bool {
        guard var current = session else { return false }
        current.vault.removeCustomFieldTemplate(id: id)
        return persist(current)
    }

    func markOpened(_ item: VaultItem) -> VaultItem {
        guard var current = session, let index = current.vault.items.firstIndex(where: { $0.id == item.id }) else { return item }
        var updated = current.vault.items[index]
        updated.lastOpenedAt = Date()
        current.vault.upsert(updated, recordHistory: false)
        return persist(current) ? updated : item
    }

    @discardableResult
    func moveToTrash(_ item: VaultItem) -> Bool { mutate(item) { $0.moveToTrash() } }
    @discardableResult
    func restore(_ item: VaultItem) -> Bool { mutate(item) { $0.restoreFromTrash() } }

    @discardableResult
    func purgeExpiredTrash(now: Date = Date(), retentionDays: Int? = nil) -> Int {
        guard var current = session else { return 0 }
        let effectiveDays = retentionDays ?? preferences.trashRetentionDays
        guard effectiveDays > 0 else { return 0 }
        let ids = Set(current.vault.items.filter { TrashRetentionPolicy.isExpired($0, now: now, retentionDays: effectiveDays) }.map(\.id))
        guard !ids.isEmpty else { return 0 }
        current.vault.removePermanently(ids: ids)
        return persist(current) ? ids.count : 0
    }

    func expiredTrashCount(now: Date = Date(), retentionDays: Int) -> Int {
        guard retentionDays > 0 else { return 0 }
        return vault.items.filter { TrashRetentionPolicy.isExpired($0, now: now, retentionDays: retentionDays) }.count
    }

    @discardableResult
    func applyBulk(
        selectedIDs: Set<UUID>,
        favorite: Bool? = nil,
        pinned: Bool? = nil,
        group: String? = nil,
        addTags: [String] = [],
        removeTags: [String] = [],
        moveToTrash: Bool = false,
        restoreFromTrash: Bool = false
    ) -> Bool {
        guard var current = session, !selectedIDs.isEmpty else { return false }
        let selectedItems = current.vault.items.filter { selectedIDs.contains($0.id) }
        guard selectedItems.count == selectedIDs.count else {
            errorMessage = t(.unableSaveChanges)
            return false
        }
        if group != nil, Set(selectedItems.map(\.kind)).count != 1 {
            errorMessage = t(.unableSaveChanges)
            return false
        }
        if let group, !group.isEmpty {
            guard let groupID = UUID(uuidString: group),
                  selectedItems.allSatisfy({ item in current.vault.groupRegistry.groups(for: item.kind).contains(where: { $0.id == groupID }) }) else {
                errorMessage = t(.unableSaveChanges)
                return false
            }
        }
        guard let normalizedAddTags = TagPolicy.normalizedSelection(addTags),
              selectedItems.allSatisfy({ TagPolicy.normalizedSelection($0.tags + normalizedAddTags) != nil }) else {
            errorMessage = t(.unableSaveChanges)
            return false
        }
        current.vault.items = VaultBulkMutation.apply(
            to: current.vault.items,
            selectedIDs: selectedIDs,
            favorite: favorite,
            pinned: pinned,
            group: group,
            addTags: normalizedAddTags,
            removeTags: removeTags,
            moveToTrash: moveToTrash,
            restoreFromTrash: restoreFromTrash,
            modifiedAt: Date()
        )
        for tag in normalizedAddTags { current.vault.tagRegistry.create(name: tag) }
        if let pinned {
            for kind in VaultItemKind.allCases {
                let selectedKindIDs = selectedItems.filter { $0.kind == kind }.map(\.id)
                var order = current.vault.pinnedOrder.order(for: kind).filter { !selectedKindIDs.contains($0) }
                if pinned { order.append(contentsOf: selectedKindIDs) }
                current.vault.pinnedOrder.setOrder(order, for: kind)
            }
        }
        return persist(current)
    }

    @discardableResult
    func deletePermanently(ids: Set<UUID>) -> Bool {
        guard var current = session, !ids.isEmpty else { return false }
        current.vault.removePermanently(ids: ids)
        return persist(current)
    }
    @discardableResult
    func deletePermanently(_ item: VaultItem) -> Bool { deletePermanently(ids: [item.id]) }
    @discardableResult
    func emptyTrash() -> Bool {
        guard var current = session else { return false }
        let ids = Set(current.vault.items.filter(\.isDeleted).map(\.id))
        guard !ids.isEmpty else { return false }
        current.vault.removePermanently(ids: ids)
        return persist(current)
    }

    @discardableResult
    private func mutate(_ item: VaultItem, mutation: (inout VaultItem) -> Void) -> Bool {
        guard var current = session, let index = current.vault.items.firstIndex(where: { $0.id == item.id }) else { return false }
        mutation(&current.vault.items[index]); current.vault.items[index].modifiedAt = Date()
        return persist(current)
    }

    @discardableResult
    func addAttachment(name: String, data: Data, group: String = "", tags: [String] = []) -> Bool {
        guard session != nil, state == .unlocked else {
            errorMessage = t(.unableSaveChanges)
            return false
        }
        do {
            try AttachmentPolicy.validate(newDataSize: data.count, existingBytes: 0)
            return save(VaultItem(kind: .attachment, title: name, tags: tags, group: group, attachmentName: name, attachmentData: data))
        } catch {
            errorMessage = t(.unableImportAttachment)
            return false
        }
    }

    func exportBackup(scope: BackupScope = .complete) -> Data? {
        do {
            guard let session else { return nil }
            return try store.exportBackup(session: session, scope: scope)
        }
        catch { errorMessage = t(.unableExportBackup); return nil }
    }

    func previewBackup(_ data: Data, password: String) -> BackupPreview? {
        do { return try store.previewBackup(data, password: password) }
        catch { errorMessage = t(.backupRejected); return nil }
    }

    func previewBackupAsync(_ data: Data, password: String) async -> Result<BackupPreview, Error> {
        let store = self.store
        return await Task.detached(priority: .userInitiated) {
            Result { try store.previewBackup(data, password: password) }
        }.value
    }

    func backupImportErrorMessage(_ error: Error) -> String {
        let chinese = languageStore.language == .simplifiedChinese
        switch error as? VaultCryptoError {
        case .authenticationFailed:
            return chinese ? "无法解密此备份。请确认输入的是该网页版密码库导出时使用的主密码。" : "This backup could not be decrypted. Enter the master password used by the web vault when it was exported."
        case .unsupportedVersion:
            return chinese ? "此备份版本暂不受支持。" : "This backup version is not supported."
        case .invalidParameters:
            return chinese ? "备份的密钥参数无效。" : "The backup key parameters are invalid."
        case .invalidEnvelope:
            return chinese ? "备份内容结构或完整性校验失败，并非密码错误。" : "The backup content failed schema or integrity validation; this is not a password error."
        default:
            return chinese ? "无法读取备份，请确认文件完整且格式受支持。" : "The backup could not be read. Make sure it is complete and supported."
        }
    }

    @discardableResult
    func importBackup(_ data: Data, password: String) -> BackupImportResult {
        do {
            guard let current = session else { throw VaultCryptoError.invalidParameters }
            var importedSession = try store.importBackupSession(data, password: password, destinationSession: current)
            importedSession.vault.normalizeOrganizationReferences()
            guard importedSession.vault.items.allSatisfy({ TagPolicy.normalizedSelection($0.tags) != nil }) else { throw VaultCryptoError.invalidEnvelope }
            try store.save(importedSession)
            session = importedSession
            vault = importedSession.vault
            state = .unlocked
            errorMessage = nil
            recordActivity()
            if quickUnlock.isEnabled {
                do { try quickUnlock.disable(); quickUnlockEnabled = false }
                catch {
                    quickUnlockEnabled = quickUnlock.isEnabled
                    noticeMessage = t(.backupImportedDisableFailed)
                    lock()
                    return .importedQuickUnlockCleanupFailed
                }
            }
            noticeMessage = t(.backupImported)
            return .imported
        } catch {
            errorMessage = t(.backupRejected)
            return .rejected
        }
    }

    @discardableResult
    func changePassword(currentPassword: String, newPassword: String) -> Bool {
        guard newPassword.count >= 8 else { errorMessage = t(.useAtLeast8); return false }
        do {
            _ = try store.unlock(password: currentPassword)
            guard let current = session else { return false }
            let updated = try store.changePassword(session: current, newPassword: newPassword)
            session = updated
            if quickUnlockEnabled { try updated.withKeyData { try quickUnlock.enable(vaultKeyData: $0) } }
            errorMessage = nil
            noticeMessage = t(.masterPasswordChanged)
            return true
        } catch {
            errorMessage = t(.masterPasswordNotChanged)
            return false
        }
    }

    func setQuickUnlock(enabled: Bool) {
        do {
            if enabled {
                guard let session else { return }
                try session.withKeyData { try quickUnlock.enable(vaultKeyData: $0) }
            } else { try quickUnlock.disable() }
            preferences.quickUnlockOptIn = enabled
            quickUnlockEnabled = enabled; noticeMessage = t(enabled ? .quickUnlockEnabled : .quickUnlockDisabled)
        } catch { errorMessage = t(.unableUpdateQuickUnlock) }
    }

    func copySecret(_ value: String, clearAfter seconds: TimeInterval? = nil) {
        let clearDelay = seconds ?? preferences.clipboardClearChoice.seconds
        if clearDelay > 0 {
            let expiration = Date().addingTimeInterval(clearDelay)
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: value]], options: ClipboardPolicy.options(expirationDate: expiration))
        } else {
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: value]], options: [.localOnly: true])
        }
        clipboardChangeCount = UIPasteboard.general.changeCount
        clipboardTask?.cancel()
        guard clearDelay > 0 else { noticeMessage = t(.copiedClipboard); return }
        clipboardTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(clearDelay))
            guard !Task.isCancelled else { return }
            self?.clearClipboardIfOwned()
        }
        noticeMessage = t(.copiedClipboard)
    }

    private func clearClipboardIfOwned() {
        clipboardTask?.cancel(); clipboardTask = nil
        guard let count = clipboardChangeCount, UIPasteboard.general.changeCount == count else { clipboardChangeCount = nil; return }
        UIPasteboard.general.items = []; clipboardChangeCount = nil
    }

    @discardableResult
    private func persist(_ updated: VaultSession) -> Bool {
        do {
            try store.save(updated); session = updated; vault = updated.vault; errorMessage = nil
            return true
        } catch {
            errorMessage = t(.unableSaveChanges)
            return false
        }
    }
}
