import XCTest

final class SixthBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testSwipeUsesStableLiveOffsetInsteadOfGestureStateReset() throws {
        let source = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertTrue(source.contains("@State private var liveOffset"))
        XCTAssertTrue(source.contains(".onChanged { value in"))
        XCTAssertTrue(source.contains("predictedEndTranslation.width - value.translation.width"))
        XCTAssertFalse(source.contains("@GestureState private var dragOffset"))
        XCTAssertFalse(source.contains(".updating($dragOffset)"))
    }

    func testEveryActionBearingProductListReceivesRootEditRoute() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("customRecordsHomePane"))
        XCTAssertTrue(source.contains("onEditItem: { openProductRoute(.editor($0)) }"))
        XCTAssertTrue(source.contains("case .recoveryCenter:\n            RecoveryCenterView()"))
        XCTAssertFalse(source.contains("filteredEditorItem"))
        XCTAssertFalse(source.contains("else { filteredEditorItem = item }"))
    }

    func testFavoritesIsTapOnlyWithoutEllipsisOrSwipe() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("rowInteraction: .tapOnly"))
        XCTAssertTrue(source.contains("case .tapOnly:\n            rowContent"))
        XCTAssertTrue(source.contains("if rowInteraction == .actions"))
    }
}
