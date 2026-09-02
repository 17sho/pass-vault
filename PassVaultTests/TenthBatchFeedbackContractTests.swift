import XCTest

final class TenthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testFileImportsUseAppLifetimeUIKitCoordinator() throws {
        let app = try source("App/PassVaultApp.swift")
        let coordinator = try source("Features/FileImportCoordinator.swift")
        let rootView = try source("Features/RootView.swift")
        let settings = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(app.contains("FileImportHost(coordinator: fileImporter)"))
        XCTAssertTrue(coordinator.contains("UIDocumentPickerViewController"))
        XCTAssertTrue(coordinator.contains("documentPickerWasCancelled"))
        XCTAssertTrue(coordinator.contains("case .attachment"))
        XCTAssertTrue(coordinator.contains("case .backup"))
        XCTAssertFalse(rootView.contains(".fileImporter("))
        XCTAssertFalse(settings.contains(".fileImporter("))
    }

    func testBackupAndAttachmentHaveSeparateRootRequests() throws {
        let coordinator = try source("Features/FileImportCoordinator.swift")
        let settings = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(settings.contains("fileImporter.request(.backup)"))
        XCTAssertTrue(coordinator.contains("AttachmentImportReader.readOwnedData"))
        XCTAssertTrue(coordinator.contains("passVaultBackupImportReady"))
        XCTAssertTrue(coordinator.contains("onAttachmentDraft"))
    }

    func testAllPhoneDetailsUseDirectionalBackTransition() throws {
        let views = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(views.contains("GeometryReader { pane in"))
        XCTAssertTrue(views.contains(".offset(x: showingDetail ? -pane.size.width : 0)"))
        XCTAssertTrue(views.contains(".transition(.move(edge: .trailing))"))
        XCTAssertTrue(views.contains("customRecordsHomePane(onOpenDetail: { openPhoneDetail() })"))
    }

    func testRecoveryCenterHasBackAndClose() throws {
        let views = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(views.contains("@Environment(\\.pvModalBack) private var back"))
        XCTAssertTrue(views.contains("Button(action: back)"))
        XCTAssertTrue(views.contains("Button(action: dismiss)"))
    }
}
