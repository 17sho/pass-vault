import XCTest

final class Feedback47And48ContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testEditorsAndAttachmentsUseManagedGroupAndTagSelectors() throws {
        let editor = try source("Features/Vault/VaultEditorAndSettings.swift")
        let attachment = try source("Features/Vault/AttachmentImportComposer.swift")
        XCTAssertTrue(editor.contains("VaultGroupSelectionField(selection: $groupSelection"))
        XCTAssertTrue(editor.contains("VaultTagSelectionField(selection: $selectedTags)"))
        XCTAssertFalse(editor.contains("TextField(t(.tags), text:"))
        XCTAssertTrue(attachment.contains("VaultGroupSelectionField(selection: $selectedGroup, kind: .attachment)"))
        XCTAssertTrue(attachment.contains("VaultTagSelectionField(selection: $selectedTags)"))
    }

    func testSelectorsCanCreateAndImmediatelySelectOrganizationValues() throws {
        let source = try source("Features/Vault/VaultOrganizationSelectors.swift")
        XCTAssertTrue(source.contains("groupRegistry.create(name: clean, kind: kind)"))
        XCTAssertTrue(source.contains("commit(created.id.uuidString)"))
        XCTAssertTrue(source.contains("tagRegistry.create(name: clean, colorHex: newColor)"))
        XCTAssertTrue(source.contains("staged.insert(created.name)"))
    }

    func testSelectorsUseRootOverlaySingleBorderAndFixedWorkspace() throws {
        let source = try source("Features/Vault/VaultOrganizationSelectors.swift")
        XCTAssertTrue(source.contains("@Environment(\\.pvPresentChoiceOverlay) private var presentOverlay"))
        XCTAssertFalse(source.contains("@State private var showing"))
        XCTAssertFalse(source.contains(".pvWebModal(isPresented:"))
        XCTAssertTrue(source.contains("embedded ? Color.clear : PVTheme.surface"))
        XCTAssertTrue(source.contains("if !embedded { RoundedRectangle"))
        XCTAssertTrue(source.contains("sizing: .workspace"))
        XCTAssertTrue(source.contains(".frame(maxHeight: .infinity)"))
        XCTAssertTrue(source.contains("PVModalFooter"))
    }

    func testCustomRecordsEmptyStateRetainsFullListWorkspace() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("customRecordsHomePane"))
        XCTAssertTrue(source.contains("kind: .custom"))
        XCTAssertTrue(source.contains("compact: false"))
    }
}
