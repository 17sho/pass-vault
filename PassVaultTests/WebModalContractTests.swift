import XCTest

final class WebModalContractTests: XCTestCase {
    func testProductFlowsDoNotUsePageCoveringSystemPresentations() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let files = [
            "Features/RootView.swift",
            "Features/Vault/VaultViews.swift",
            "Features/Vault/VaultEditorAndSettings.swift"
        ]
        let forbidden = [".sheet(", ".fullScreenCover(", ".alert(", ".confirmationDialog("]
        for file in files {
            let source = try String(contentsOf: root.appendingPathComponent(file), encoding: .utf8)
            for token in forbidden {
                XCTAssertFalse(source.contains(token), "\(file) must present product UI through PVWebModal instead of \(token)")
            }
        }
    }

    func testWebModalComponentOwnsBackdropCardAndAccessibilityContract() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("PVWebModal"))
        XCTAssertTrue(source.contains("modal-backdrop"))
        XCTAssertTrue(source.contains("modal-card"))
        XCTAssertTrue(source.contains("accessibilityAddTraits(.isModal)"))
    }
}
