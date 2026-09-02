import XCTest
@testable import PassVault

@MainActor
final class UnlockInteractionParityTests: XCTestCase {
    func testPasswordGateNeverAutomaticallyTriggersQuickUnlock() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("Features/RootView.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("AutomaticQuickUnlockPolicy"))
        XCTAssertFalse(source.contains(".task {\n            guard mode == .unlock"))
        XCTAssertTrue(source.contains("Button { Task { await model.quickUnlockNow() } }"))
        XCTAssertTrue(source.contains("GeometryReader { proxy in"))
        XCTAssertTrue(source.contains(".position(x: proxy.size.width / 2, y: proxy.size.height / 2)"))
        XCTAssertFalse(source.contains("struct PasswordGateView: View {\n") && source.contains("var body: some View {\n        ScrollView"))
    }
}
