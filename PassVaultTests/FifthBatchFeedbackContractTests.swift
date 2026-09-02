import XCTest

final class FifthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testSwipeTracksBothDirectionsWithoutDynamicLayerReordering() throws {
        let source = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertTrue(source.contains("let resetRequest: Int"))
        XCTAssertTrue(source.contains(".onChange(of: resetRequest)"))
        XCTAssertTrue(source.contains("liveOffset = clamp(restingOffset + value.translation.width)"))
        XCTAssertFalse(source.contains(".zIndex(restingOffset == 0 && dragOffset == 0 ? 2 : 0)"))
    }

    func testMainOverlaysAreMutuallyExclusiveAndEditUsesRootRoute() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("interactionResetRequest += 1"))
        XCTAssertTrue(source.contains("onEditItem:"))
        XCTAssertTrue(source.contains("openProductRoute(.editor($0))"))
        XCTAssertFalse(source.contains("edit: { pendingActionItem = nil; filteredEditorItem = item }"))
    }

    func testRecoveryCenterTerminologyAndSwipeActionCopy() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertFalse(source.contains("移入废纸篓"))
        XCTAssertFalse(source.contains("清空废纸篓"))
        XCTAssertTrue(source.contains("deleteTitle: t(.delete)"))
    }

    func testMoreSpecialListsUseCanonicalDestinationSizing() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("showCustomRecordsOnHome()"))
        XCTAssertTrue(source.contains("case .recoveryCenter: MoreMenuModalSizing.sizing(.recoveryCenter)"))
    }

    func testAttachmentImportHasSingleDeferredPresentationAndOwnedCopy() throws {
        let vaultSource = try source("Features/Vault/VaultViews.swift")
        let rootView = try source("Features/RootView.swift")
        XCTAssertTrue(vaultSource.contains("transaction.disablesAnimations = true"))
        XCTAssertFalse(vaultSource.contains(".onChange(of: productRoute == nil)"))
        let coordinator = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(coordinator.contains("AttachmentImportReader.readOwnedData"))
        XCTAssertTrue(vaultSource.contains("attachmentImportCompletion += 1"))
        XCTAssertTrue(vaultSource.contains(".onChange(of: attachmentImportCompletion)"))
        XCTAssertTrue(vaultSource.contains("attachmentCategory = nil"))
        XCTAssertTrue(coordinator.contains("documentPickerWasCancelled"))
    }
}
