import XCTest

final class Feedback78PrivacyShieldDesignTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testAppSwitcherShieldUsesFullScreenBrandedHierarchy() throws {
        let source = try source("App/PassVaultApp.swift")
        XCTAssertTrue(source.contains("GeometryReader { proxy in"))
        XCTAssertTrue(source.contains("Text(\"Pass Vault\")"))
        XCTAssertTrue(source.contains("L10n.text(.brandSubtitle"))
        XCTAssertTrue(source.contains("Image(systemName: \"lock.shield.fill\")"))
        XCTAssertTrue(source.contains("L10n.text(.passVaultLocked"))
        XCTAssertTrue(source.contains("L10n.text(.contentLocalOnly"))
        XCTAssertTrue(source.contains("L10n.text(.localCapabilityBoundary"))
        XCTAssertTrue(source.contains(".accessibilityIdentifier(\"privacy-shield\")"))
    }

    func testShieldStillCoversAllProductOwnedOverlays() throws {
        let source = try source("App/PassVaultApp.swift")
        let product = try XCTUnwrap(source.range(of: "PVChoiceOverlayContainer"))
        let shield = try XCTUnwrap(source.range(of: "PrivacyShieldOverlay(model:"))
        XCTAssertLessThan(product.lowerBound, shield.lowerBound)
        XCTAssertTrue(source.contains(".zIndex(100_000)"))
        XCTAssertTrue(source.contains("SensitiveContentPolicy.shouldShield"))
    }
}
