import XCTest

final class Feedback75EdgeBackGestureTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testPhoneDetailUsesNativeLeadingEdgeBackRecognizer() throws {
        let recognizer = try source("Features/Vault/PVNativeEdgeBackRecognizer.swift")
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(recognizer.contains("UIScreenEdgePanGestureRecognizer"))
        XCTAssertTrue(recognizer.contains("recognizer.edges = .left"))
        XCTAssertTrue(recognizer.contains("progress >= 0.32 || velocity >= 650"))
        XCTAssertTrue(vault.contains("PVNativeEdgeBackRecognizer("))
        XCTAssertTrue(vault.contains("isEnabled: showingDetail"))
        XCTAssertTrue(vault.contains("onProgress: updateDetailEdgeBack"))
        XCTAssertTrue(vault.contains("onFinish: finishDetailEdgeBack"))
    }

    func testExistingBackButtonRemainsAvailable() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vault.contains(".accessibilityIdentifier(\"item-detail-back\")"))
        XCTAssertTrue(vault.contains("onBack: closePhoneDetail"))
    }

    func testPhoneListSupportsNonControlHorizontalCategorySwipes() throws {
        let recognizer = try source("Features/Vault/PVNativeCategorySwipeRecognizer.swift")
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(recognizer.contains("UIPanGestureRecognizer"))
        XCTAssertTrue(recognizer.contains("window.addGestureRecognizer(recognizer)"))
        XCTAssertTrue(recognizer.contains("container.convert(container.bounds, to: hostWindow)"))
        XCTAssertTrue(recognizer.contains("activeFrame.contains(point)"))
        XCTAssertTrue(recognizer.contains("abs(translation.x) >= distanceThreshold"))
        XCTAssertTrue(recognizer.contains("current is UIControl || current is UITextField || current is UITextView"))
        XCTAssertFalse(recognizer.contains("current.accessibilityIdentifier == \"vault-row-touch-surface\""))
        XCTAssertTrue(vault.contains("onCategorySwipe: switchCategoryBySwipe"))
        XCTAssertTrue(vault.contains("targetIndex = index + 1"))
        XCTAssertTrue(vault.contains("targetIndex = index - 1"))
        XCTAssertTrue(vault.contains("guard categories.indices.contains(targetIndex)"))
    }
}
