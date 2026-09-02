import XCTest

final class WebBackupCompatibilityContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testWebJSONIsImportableButNativeExportTypeStaysCanonical() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let picker = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(vault.contains("importableContentTypes: [UTType] { readableContentTypes + [.json] }"))
        XCTAssertTrue(picker.contains("BackupDocument.importableContentTypes"))
        let settings = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(settings.contains("contentType: BackupDocument.readableContentTypes[0]"))
    }

    func testWebAdapterImplementsRealCryptoAndFormatDispatch() throws {
        let adapter = try source("Storage/WebBackupImportAdapter.swift")
        let store = try source("Storage/EncryptedVaultStore.swift")
        XCTAssertTrue(adapter.contains("pass-vault-v2"))
        XCTAssertTrue(adapter.contains("iterations == 310_000"))
        XCTAssertTrue(adapter.contains("AES.GCM.SealedBox"))
        XCTAssertTrue(adapter.contains("pass-vault-v2:attachment:1:"))
        XCTAssertTrue(adapter.contains("SHA256.hash(data: encryptedObject)"))
        XCTAssertTrue(store.contains("WebBackupImportAdapter.recognizes(data)"))
        XCTAssertTrue(store.contains("WebBackupImportAdapter.decode(data, password: password)"))
    }

    func testUnicodePasswordUsesAnOptionalPBKDFPointerAndRealProducerFixture() throws {
        let crypto = try source("Core/Crypto/VaultCrypto.swift")
        XCTAssertTrue(crypto.contains("passwordBuffer.bindMemory(to: Int8.self).baseAddress,"))
        XCTAssertFalse(crypto.contains("passwordBuffer.bindMemory(to: Int8.self).baseAddress!"))
        XCTAssertNotNil(Bundle(for: Self.self).url(forResource: "web-v1-unicode-password", withExtension: "json"))
    }

    func testAttachmentImagePreviewLivesInsideDetailAndSupportsRealZooming() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let preview = try source("Features/Vault/AttachmentPreviewView.swift")
        XCTAssertFalse(vault.contains("case attachmentPreview(VaultItem)"))
        XCTAssertTrue(vault.contains("@State private var detailPreviewItem: VaultItem?"))
        XCTAssertTrue(vault.contains("detailPreviewItem = $0"))
        XCTAssertTrue(preview.contains("attachment-preview-loading"))
        XCTAssertTrue(preview.contains("Task.detached(priority: .userInitiated)"))
        XCTAssertTrue(preview.contains("CGImageSourceCreateThumbnailAtIndex"))
        XCTAssertTrue(preview.contains("UIScrollViewDelegate"))
        XCTAssertTrue(preview.contains("minimumZoomScale"))
        XCTAssertTrue(preview.contains("UITapGestureRecognizer"))
        XCTAssertTrue(preview.contains("override func layoutSubviews()"))
        XCTAssertFalse(preview.contains("NavigationStack"))
    }

    func testWebRestorePreservesCurrentNativePasswordAndReportsTypedFailure() throws {
        let confirmation = try source("Features/Vault/BackupImportConfirmationView.swift")
        let model = try source("App/AppModel.swift")
        let store = try source("Storage/EncryptedVaultStore.swift")
        XCTAssertTrue(confirmation.contains("导入不会更改当前主密码"))
        XCTAssertTrue(confirmation.contains("backupImportErrorMessage"))
        XCTAssertTrue(model.contains("destinationSession: current"))
        XCTAssertTrue(store.contains("destinationSession: VaultSession"))
        let webBranch = store.components(separatedBy: "if WebBackupImportAdapter.recognizes(data)").last ?? ""
        XCTAssertFalse(webBranch.prefix(700).contains("let key = SymmetricKey(size: .bits256)"))
    }
}
