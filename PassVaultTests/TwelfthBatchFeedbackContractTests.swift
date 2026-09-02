import XCTest

final class TwelfthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testBackupPreviewHasVisibleBusyAndInlineFailureState() throws {
        let confirmationSource = try source("Features/Vault/BackupImportConfirmationView.swift")
        XCTAssertTrue(confirmationSource.contains("@State private var verifying"))
        XCTAssertTrue(confirmationSource.contains("errorText"))
        XCTAssertTrue(confirmationSource.contains("ProgressView()"))
        let model = try source("App/AppModel.swift")
        XCTAssertTrue(model.contains("Task.detached"))
    }

    func testAttachmentPreviewDoesNotNestAStoredOverlayFromDetail() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("@State private var detailPreviewItem: VaultItem?"))
        XCTAssertTrue(source.contains("DetailPreviewWorkspace"))
        XCTAssertFalse(source.contains("case attachmentPreview(VaultItem)"))
        XCTAssertFalse(source.contains(".pvWebModal(isPresented: $showingAttachmentPreview"))
    }

    func testRootOverlayReceivesAllEnvironmentObjects() throws {
        let source = try source("App/PassVaultApp.swift")
        let host = source.components(separatedBy: "PVChoiceOverlayContainer").last ?? ""
        XCTAssertTrue(host.contains(".environmentObject(model)"))
        XCTAssertTrue(host.contains(".environmentObject(languageStore)"))
        XCTAssertTrue(host.contains(".environmentObject(preferences)"))
        XCTAssertTrue(host.contains(".environmentObject(fileImporter)"))
    }

    func testAttachmentComposerOffersThreeSourcesAndConfirmationMetadata() throws {
        let source = try source("Features/Vault/AttachmentImportComposer.swift")
        for token in ["photo.on.rectangle", "camera", "folder", "selectedGroup", "selectedTags", "加密并添加"] {
            XCTAssertTrue(source.contains(token), "missing \(token)")
        }
    }

    func testMediaUsageDescriptionsAndCoordinatorCallbacksExist() throws {
        let project = try source("project.yml")
        let coordinator = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(project.contains("NSCameraUsageDescription"))
        XCTAssertTrue(project.contains("NSPhotoLibraryUsageDescription"))
        XCTAssertTrue(coordinator.contains("PHPickerViewControllerDelegate"))
        XCTAssertTrue(coordinator.contains("UIImagePickerControllerDelegate"))
    }
}
