import XCTest

final class FourthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testSwipeActionButtonRemainsAboveDismissOverlay() throws {
        let source = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertTrue(source.contains(".zIndex(1)"), "Delete action must remain above the shifted row's dismissal overlay")
        XCTAssertTrue(source.contains(".opacity(actionRevealProgress)"), "Delete background must not flash before a real swipe")
        XCTAssertTrue(source.contains(".allowsHitTesting(restingOffset != 0)"), "Delete action must only receive taps while revealed")
    }

    func testDestructiveConfirmationsAlwaysExplainScopeAndConsequence() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let more = try source("Features/Vault/MoreMenuLocalViews.swift")
        XCTAssertTrue(vault.contains("bulkTrashConfirmationMessage"))
        XCTAssertTrue(vault.contains("bulkPermanentDeleteConfirmationMessage"))
        XCTAssertTrue(vault.contains("emptyTrashConfirmationMessage"))
        XCTAssertTrue(vault.contains("singleTrashConfirmationMessage"))
        XCTAssertTrue(vault.contains("singlePermanentDeleteConfirmationMessage"))
        XCTAssertTrue(vault.contains("groupDeleteConfirmationMessage"))
        XCTAssertTrue(more.contains("tagDeleteConfirmationMessage"))
        XCTAssertTrue(more.contains("groupDeleteConfirmationMessage"))
    }
}
