import XCTest

final class EighthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testRecoveryCenterUsesDedicatedRowsWithoutOrdinaryActions() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("RecoveryCenterItemRow("))
        XCTAssertTrue(source.contains("onRestore: { restoreFromRecoveryCenter(item) }"))
        XCTAssertTrue(source.contains("onPermanentDelete: { pendingPermanentDeleteItem = item }"))
        XCTAssertFalse(source.contains("VaultListView(filter: .trash, selectedItem: $selectedItem, onEditItem:"))
    }

    func testAttachmentPickerStartsFromActualModalDisappear() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(source.contains("await Task.yield()\n            completePendingSystemAction()"))
        XCTAssertFalse(source.contains(".onDisappear { completePendingSystemAction() }"))
        XCTAssertFalse(source.contains("Task.sleep(for: .milliseconds"))
    }
}
