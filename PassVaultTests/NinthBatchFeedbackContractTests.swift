import XCTest

final class NinthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testAttachmentImporterLivesAtStableRoot() throws {
        let rootView = try source("Features/RootView.swift")
        let vault = try source("Features/Vault/VaultViews.swift")
        let coordinator = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(coordinator.contains("UIDocumentPickerViewController"))
        XCTAssertTrue(coordinator.contains("AttachmentImportReader.readOwnedData"))
        XCTAssertTrue(vault.contains("passVaultRequestAttachmentImport"))
        XCTAssertFalse(vault.contains(".fileImporter(isPresented: $importingAttachment"))
        XCTAssertFalse(vault.contains("handleAttachmentImport"))
    }

    func testBuiltInTemplatesHaveDistinctSemanticIcons() throws {
        let models = try source("Core/Models/VaultModels.swift")
        for icon in ["doc.badge.plus", "creditcard", "person.text.rectangle", "key", "server.rack", "checkmark.seal"] {
            XCTAssertTrue(models.contains("\"\(icon)\""))
        }
        XCTAssertTrue(try source("Features/Vault/VaultViews.swift").contains("icon: template.icon"))
    }

    func testUnlockUsesSingleShortTransitionWithoutSleep() throws {
        let rootView = try source("Features/RootView.swift")
        XCTAssertTrue(rootView.contains("easeOut(duration: 0.18)"))
        XCTAssertFalse(rootView.contains("Task.sleep(for: .milliseconds(300))"))
        XCTAssertFalse(rootView.contains("Task.sleep(for: .milliseconds(650))"))
    }

    func testPhoneDetailHasOnlyBackControl() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vault.contains("accessibilityIdentifier(\"item-detail-back\")"))
        XCTAssertFalse(vault.contains("accessibilityIdentifier(\"item-detail-close\")"))
        XCTAssertFalse(vault.contains("onClose: closePhoneDetail"))
    }

    func testCustomRecordsUsesSeparatedForwardAndBackAnimation() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vault.contains("setCustomRecordsVisible(true)"))
        XCTAssertTrue(vault.contains("setCustomRecordsVisible(false)"))
        XCTAssertTrue(vault.contains("await Task.yield()\n            setCustomRecordsVisible(true)"))
        XCTAssertTrue(vault.contains("homePaneTransition"))
    }
}
