import XCTest

final class Feedback56And59To60ContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testAttachmentCategoryKeepsLabelOnOneLineAndCapsChoiceWidth() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains(".fixedSize(horizontal: true, vertical: false)"))
        XCTAssertTrue(source.contains(".frame(maxWidth: 240)"))
        XCTAssertFalse(source.contains(".frame(minWidth: 260, maxWidth: 360)"))
    }

    func testCategorySwitchAndScrollDoNotInstallCompetingDragOrAnimatedRowReset() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertFalse(source.contains(".simultaneousGesture(DragGesture(minimumDistance: 2)"))
        XCTAssertTrue(source.contains("VaultScrollOffsetPreferenceKey"))
        XCTAssertFalse(source.contains(".onChange(of: category) { _, _ in\n            selectedItem = nil\n            showingDetail = false\n            interactionResetRequest += 1"))
    }

    func testThemeSelectionUsesCoordinatedRootColorAnimation() throws {
        let app = try source("App/PassVaultApp.swift")
        let modal = try source("Features/PVWebModal.swift")
        let more = try source("Features/Vault/MoreMenuLocalViews.swift")
        let settings = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(app.contains(".animation(.easeInOut(duration: 0.24), value: preferences.theme)"))
        XCTAssertTrue(modal.contains("var selectionAnimation: Animation? = nil"))
        XCTAssertTrue(more.contains("selectionAnimation: .easeInOut(duration: 0.24)"))
        XCTAssertTrue(settings.contains("selectionAnimation: .easeInOut(duration: 0.24)"))
    }
}
