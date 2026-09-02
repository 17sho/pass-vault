import XCTest

final class Feedback55To58ContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testTagFilterOwnsStateInsideRootOverlayAndCommitsByCallback() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("private struct VaultTagFilterSurface: View"))
        XCTAssertTrue(source.contains("@State private var stagedTags: Set<String>"))
        XCTAssertTrue(source.contains("@State private var modeIsAll: Bool"))
        XCTAssertTrue(source.contains("presentOverlay(AnyView(VaultTagFilterSurface"))
        XCTAssertTrue(source.contains("apply(stagedTags, modeIsAll); close()"))
        XCTAssertFalse(source.contains(".pvWebModal(isPresented: $showingTagFilter"))
    }

    func testAttachmentCategorySelectorKeepsLabelReadableAndCapsField() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains(".fixedSize(horizontal: true, vertical: false)"))
        XCTAssertTrue(source.contains(".frame(maxWidth: 240)"))
        XCTAssertFalse(source.contains(".frame(minWidth: 260, maxWidth: 360)"))
    }

    func testPrivacyShieldIsAboveRootOverlayHostAndAnimatesAway() throws {
        let app = try source("App/PassVaultApp.swift")
        let rootView = try source("Features/RootView.swift")
        XCTAssertTrue(app.contains("PrivacyShieldOverlay(model: model, language: languageStore.language)"))
        XCTAssertTrue(app.contains(".zIndex(100_000)"))
        XCTAssertTrue(app.contains("withAnimation(.easeOut(duration: reduceMotion ? 0.10 : 0.24))"))
        XCTAssertTrue(app.range(of: "PVChoiceOverlayContainer")!.lowerBound < app.range(of: "PrivacyShieldOverlay(model:")!.lowerBound)
        XCTAssertFalse(rootView.contains("if SensitiveContentPolicy.shouldShield"))
    }
}
