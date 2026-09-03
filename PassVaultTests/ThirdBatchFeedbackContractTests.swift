import XCTest

final class ThirdBatchFeedbackContractTests: XCTestCase {
    private var root: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testAnchoredMenuUsesOverlayCoordinateSpaceAndCorrectBoundsMath() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains(".coordinateSpace(name: \"vault-list-overlay\")"))
        XCTAssertTrue(source.contains("proxy.frame(in: .named(\"vault-list-overlay\"))"))
        XCTAssertFalse(source.contains("proxy.frame(in: .global)"))
        XCTAssertTrue(source.contains("pendingActionAnchor.maxY + height + 6 <= size.height - 12"))
    }

    func testSwipeGestureWinsOverRowButtonTap() throws {
        let source = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertTrue(source.contains(".highPriorityGesture("))
        XCTAssertFalse(source.contains("LongPressGesture(minimumDuration: 0.45, maximumDistance: 18)"))
        XCTAssertTrue(source.contains("if restingOffset != 0"))
    }

    func testProductModalFadesBackdropFromTransparentWithoutDuplicateScaleTransition() throws {
        let modal = try source("Features/PVWebModal.swift")
        let vault = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(modal.contains("Color.black.opacity(appeared ? 0.34 : 0)"))
        XCTAssertTrue(modal.contains("@State private var appeared = false"))
        XCTAssertTrue(vault.contains(".transition(.opacity)"))
        XCTAssertFalse(vault.contains(".transition(.opacity.combined(with: .scale(scale: 0.96)))"))
    }

    func testCustomAndRecoveryListsInheritProductBackAction() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("@Environment(\\.pvModalBack) private var productBackAction"))
        XCTAssertTrue(source.contains("if let back = productBackAction"))
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"back-product-modal\")"))
    }

    func testAttachmentPickerRunsAfterProductModalDismiss() throws {
        let vaultSource = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(vaultSource.contains("transaction.disablesAnimations = true"))
        XCTAssertTrue(vaultSource.contains("completePendingSystemAction()"))
        let rootView = try source("Features/RootView.swift")
        XCTAssertTrue(rootView.contains("fileImporter.request(.attachment)"))
    }

    func testBulkGroupEntryActivatesMainVaultSelectionMode() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("case .bulkGroup:\n            closeProductRoutes()\n            bulkSelectionRequest += 1"))
        XCTAssertTrue(source.contains(".onChange(of: selectionRequest)"))
        XCTAssertTrue(source.contains("selectionMode = true"))
    }
}
