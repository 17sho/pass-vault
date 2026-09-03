import XCTest

final class Feedback79PrivacyShieldDismissalTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testForegroundDismissalWaitsForLayoutAndUsesSingleOpacityAnimation() throws {
        let source = try source("App/PassVaultApp.swift")
        XCTAssertTrue(source.contains("dismissalTask = Task { @MainActor in"))
        XCTAssertTrue(source.contains("await Task.yield()"))
        XCTAssertTrue(source.contains("guard !Task.isCancelled, !shouldShield else { return }"))
        XCTAssertTrue(source.contains(".linear(duration: 0.16)"))
        XCTAssertFalse(source.contains(".scaleEffect(visible"))
    }

    func testShieldAppearsSynchronouslyWithoutAnimation() throws {
        let source = try source("App/PassVaultApp.swift")
        XCTAssertTrue(source.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(source.contains("withTransaction(transaction) { visible = true }"))
        XCTAssertTrue(source.contains(".onDisappear { dismissalTask?.cancel() }"))
    }
}
