import XCTest

final class Feedback76GestureRegressionTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testInteractiveBackKeepsNavigationLayersAdjacentAndAvoidsDoubleTransition() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vault.contains("-pane.size.width + pane.size.width * detailEdgeBackProgress : 0"))
        XCTAssertTrue(vault.contains(".offset(x: pane.size.width * detailEdgeBackProgress)"))
        XCTAssertTrue(vault.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(vault.contains("detailEdgeBackProgress = 1"))
        XCTAssertTrue(vault.contains("showingDetail = false\n                    detailEdgeBackProgress = 0"))
    }

    func testCategoryChangesAlwaysCollapseExpandedDeleteRows() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let rows = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertTrue(vault.contains(".onChange(of: category) { _, _ in\n            selectedItem = nil\n            showingDetail = false\n            interactionResetRequest += 1"))
        XCTAssertTrue(vault.contains(".id(\"\\(item.id.uuidString)-\\(interactionResetRequest)\")"))
        XCTAssertTrue(rows.contains(".onChange(of: resetRequest)"))
        XCTAssertTrue(rows.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(rows.contains("withTransaction(transaction)"))
        XCTAssertTrue(rows.contains("restingOffset = 0"))
        XCTAssertTrue(rows.contains("expandedKey = nil"))
        XCTAssertTrue(rows.contains("if restingOffset != 0 || liveOffset != 0"))
    }
}
