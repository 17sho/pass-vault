import XCTest

final class FeedbackBatchContractTests: XCTestCase {
    private var root: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testQuickUnlockFallbackAndCancelAreDistinct() throws {
        let keychain = try source("Storage/KeychainQuickUnlockStore.swift")
        XCTAssertTrue(keychain.contains("localizedFallbackTitle ="))
        XCTAssertTrue(keychain.contains("localizedCancelTitle = reason == \"解锁密码保险库\" ? \"取消\" : \"Cancel\""))
        XCTAssertFalse(keychain.contains("localizedCancelTitle = reason == \"解锁密码保险库\" ? \"使用主密码\""))
    }

    func testProductOwnedPresentationNeverUsesSystemCoverOrVerticalRouteMotion() throws {
        for path in ["Features/PVWebModal.swift", "Features/Vault/VaultViews.swift"] {
            let value = try source(path)
            XCTAssertFalse(value.contains(".fullScreenCover("), "System cover remains in \(path)")
        }
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertFalse(vault.contains(".offset(y:"))
        XCTAssertTrue(vault.contains("routeDirection"))
        XCTAssertTrue(vault.contains("AnyTransition.asymmetric"))
    }

    func testChoiceFieldOwnsEntireHitTarget() throws {
        let modal = try source("Features/PVWebModal.swift")
        XCTAssertTrue(modal.contains(".contentShape(Rectangle())"))
        XCTAssertTrue(modal.contains(".frame(maxWidth: .infinity, minHeight: 44"))
        XCTAssertFalse(modal.contains("@State private var localPresented"))
    }

    func testMoreOrderAndPrivacyPlacement() throws {
        let preferences = try source("App/LocalVaultPreferences.swift")
        XCTAssertTrue(preferences.contains(".globalSearch, .customRecords, .tags, .groupOrder, .pinOrder, .bulkGroup,") && preferences.contains(".recoveryCenter, .settings"))
        XCTAssertFalse(preferences.contains(".settings, .privacy"))
        let settings = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(settings.contains("privacyLevel"))
        XCTAssertTrue(settings.contains("privacyPersist"))
    }

    func testTemplatesAreCustomRecordOnly() throws {
        let editor = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(editor.contains("if item.kind == .custom"))
        XCTAssertTrue(editor.contains("save-as-template"))
    }

    func testTagFilterUsesRegistryDefinitionsAndColors() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vault.contains("private var availableTags: [TagDefinition]"))
        XCTAssertTrue(vault.contains("PVTagIdentityRow"))
        XCTAssertTrue(try source("Features/Vault/PVInteractiveRows.swift").contains("Color(hex: tag.colorHex)"))
    }

    func testRemovedHistoryAndEncryptedShareHaveNoProductionImplementations() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let model = try source("App/AppModel.swift")
        let models = try source("Core/Models/VaultModels.swift")
        let legacy = try source("Core/Models/VaultHistoryAndShare.swift")
        XCTAssertFalse(vault.contains("showingHistory"))
        XCTAssertFalse(vault.contains("open-item-history"))
        XCTAssertFalse(model.contains("func history(for item:"))
        XCTAssertFalse(models.contains("PasswordHistoryPolicy"))
        XCTAssertFalse(legacy.contains("LocalShareEnvelope"))
        XCTAssertFalse(legacy.contains("LocalEncryptedShareDocument"))
    }

    func testHeadersUseCloseIconAndBackAction() throws {
        let editor = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(editor.contains("Image(systemName: \"xmark\")"))
        XCTAssertTrue(editor.contains("back-product-modal"))
        XCTAssertTrue(editor.contains("close-product-modal"))
    }
}
