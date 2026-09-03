import XCTest

final class EleventhBatchRealDeviceContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testDocumentPickerImportsOwnedCopiesAndRetainsItsDelegateBoundary() throws {
        let source = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(source.contains("asCopy: true"))
        XCTAssertTrue(source.contains("private var picker: UIDocumentPickerViewController?"))
        XCTAssertTrue(source.contains("controller.dismiss(animated: true)"))
        XCTAssertTrue(source.contains("controller === picker"))
        XCTAssertTrue(source.contains("controller?.presentationController?.delegate = self"))
        XCTAssertFalse(source.contains("controller.dismiss(animated: true) {"))
        XCTAssertFalse(source.contains("asCopy: false"))
    }

    func testPhoneDetailKeepsAndAnimatesBothNavigationLayers() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("GeometryReader { pane in"))
        XCTAssertTrue(source.contains(".offset(x: showingDetail ? -pane.size.width + pane.size.width * detailEdgeBackProgress * 0.30 : 0)"))
        XCTAssertTrue(source.contains(".offset(x: pane.size.width * detailEdgeBackProgress)"))
        XCTAssertTrue(source.contains(".transition(.move(edge: .trailing))"))
    }

    func testSceneBackgroundOwnsEverySafeArea() throws {
        let source = try source("App/PassVaultApp.swift")
        XCTAssertTrue(source.contains("PVTheme.surface.ignoresSafeArea()"))
    }

    func testChoiceSelectionTearsDownOverlayBeforeThemeMutation() throws {
        let source = try source("Features/PVWebModal.swift")
        XCTAssertTrue(source.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(source.contains("await Task.yield()"))
        XCTAssertTrue(source.contains("selection = option.value"))
    }
}
