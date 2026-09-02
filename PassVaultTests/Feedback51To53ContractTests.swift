import XCTest

final class Feedback51To53ContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testTagEditorOwnsInteractiveStateInsideRootOverlaySurface() throws {
        let source = try source("Features/Vault/MoreMenuLocalViews.swift")
        XCTAssertTrue(source.contains("@Environment(\\.pvPresentChoiceOverlay) private var presentOverlay"))
        XCTAssertTrue(source.contains("presentOverlay(AnyView(TagManagementEditorSurface"))
        XCTAssertTrue(source.contains("private struct TagManagementEditorSurface: View"))
        XCTAssertTrue(source.contains("@State private var editedName: String"))
        XCTAssertTrue(source.contains("@State private var editedColor: String"))
        XCTAssertTrue(source.contains("VaultTagColorPalette(selection: $editedColor)"))
        XCTAssertTrue(source.contains("if succeeded { close() }"))
    }

    func testFormTagSelectorOwnsStateAndOffersColorAwareCreate() throws {
        let source = try source("Features/Vault/VaultOrganizationSelectors.swift")
        XCTAssertTrue(source.contains("private struct VaultTagSelectorSurface: View"))
        XCTAssertTrue(source.contains("@State private var staged: Set<String>"))
        XCTAssertTrue(source.contains("@State private var newColor"))
        XCTAssertTrue(source.contains("VaultTagColorPalette(selection: $newColor)"))
        XCTAssertTrue(source.contains("tagRegistry.create(name: clean, colorHex: newColor)"))
        XCTAssertTrue(source.contains("staged.insert(created.name)"))
    }

    func testTotpRowsReplaceEllipsisWithLiveCountdownButKeepLongPressActions() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("item.kind != .totp"))
        XCTAssertTrue(source.contains("TOTPLiveCodeView(secret: item.totpSecret)"))
        XCTAssertTrue(source.contains("let remaining = elapsed == 0 ? period : period - elapsed"))
        XCTAssertTrue(source.contains("remaining <= 5 ? PVTheme.danger"))
        XCTAssertTrue(source.contains("guard item.kind == .totp, rowInteraction == .actions"))
    }

    func testAnchoredMenuClosesAcrossNavigationScrollAndLifecycleChanges() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains(".onChange(of: category)"))
        XCTAssertTrue(source.contains("interactionResetRequest += 1"))
        XCTAssertTrue(source.contains(".onPreferenceChange(VaultScrollOffsetPreferenceKey.self)"))
        XCTAssertFalse(source.contains("simultaneousGesture(DragGesture(minimumDistance: 2)"))
        XCTAssertTrue(source.contains(".onChange(of: scenePhase)"))
        XCTAssertTrue(source.contains("if phase != .active { closeInteractions() }"))
    }
}
