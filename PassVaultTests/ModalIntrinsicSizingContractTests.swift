import XCTest

final class ModalIntrinsicSizingContractTests: XCTestCase {
    func testModalContainerMeasuresNaturalHeightBeforeApplyingViewportCap() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("struct PVIntrinsicModalLayout: Layout"))
        XCTAssertTrue(source.contains("ProposedViewSize(width: width, height: nil)"))
        XCTAssertTrue(source.contains("min(natural.height, heightCap)"))
        XCTAssertTrue(source.contains("at: CGPoint(x: bounds.minX, y: bounds.minY)"))
        XCTAssertFalse(source.contains("y: bounds.midY - dimensions.height / 2"))
    }

    func testCompactEmptyStatesCannotConsumeTheModalViewport() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/MoreMenuLocalViews.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("Spacer(minLength: 30)"))
        XCTAssertFalse(source.contains("minHeight: 220"))
    }

    func testEveryAlertAndNoticeUsesIntrinsicFitSizing() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let rootView = try String(contentsOf: root.appendingPathComponent("Features/RootView.swift"), encoding: .utf8)
        XCTAssertTrue(rootView.contains("item: $errorModal, maxWidth: 440, verticalInset: 28, sizing: .fit"))
        XCTAssertTrue(rootView.contains("item: $noticeModal, maxWidth: 440, verticalInset: 28, sizing: .fit"))

        let vault = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
        XCTAssertTrue(vault.contains("$confirmingBulkTrash, maxWidth: 440, sizing: .fit"))
        XCTAssertTrue(vault.contains("item: $pendingPermanentDeleteItem, maxWidth: 440, sizing: .fit"))
    }
}