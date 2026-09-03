import XCTest

final class RealDeviceRegressionContractTests: XCTestCase {
    private var root: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    }

    func testRemovedEncryptedShareAndImportHaveNoProductionEntries() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("new-import-encrypted-item"))
        XCTAssertFalse(source.contains("open-encrypted-share"))
        XCTAssertFalse(source.contains("importingEncryptedItem"))
        XCTAssertFalse(source.contains("shareSheet"))
    }

    func testRootProductWindowUsesOwnedCenteredTransitionInsteadOfSystemCover() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("rootProductModal"))
        XCTAssertTrue(source.contains(".transition(.opacity)"))
        XCTAssertFalse(source.contains(".transition(.opacity.combined(with: .scale(scale: 0.96)))"))
        XCTAssertFalse(source.contains(".pvWebModal(isPresented: productModalPresented"))
    }

    func testTemplateDialogOwnsItsValidationState() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultEditorAndSettings.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("private struct SaveCustomFieldTemplateModal"))
        XCTAssertTrue(source.contains("@State private var validationError: String?"))
        XCTAssertFalse(source.contains("@State private var templateError: String?"))
    }

    func testAttachmentImportCoordinatesProviderReadWithoutMemoryMapping() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/FileImportCoordinator.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("AttachmentImportReader.readOwnedData"))
        XCTAssertFalse(source.contains("maximumBytes: AttachmentPolicy.maximumFileBytes, options: .mappedIfSafe"))
        let storage = try String(contentsOf: root.appendingPathComponent("Storage/EncryptedVaultStore.swift"), encoding: .utf8)
        XCTAssertTrue(storage.contains("NSFileCoordinator"))
        XCTAssertTrue(storage.contains("if values.isRegularFile == false"))
        XCTAssertTrue(storage.contains("FileReadPolicy.readData(at: coordinatedURL)"))
    }

    func testFilteredCollectionsDoNotShowOrganizationFilters() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("if filter == .all {\n                    VaultFilterToolbar"))
    }

    func testChoiceFieldNeverHostsFullscreenModalInsideButtonOverlay() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("if localPresented { choiceSurface"))
        XCTAssertFalse(source.contains(".fullScreenCover("))
        XCTAssertTrue(source.contains(".contentShape(Rectangle())"))
    }
}
