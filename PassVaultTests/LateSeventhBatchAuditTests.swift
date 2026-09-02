import XCTest

final class LateSeventhBatchAuditTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testAttachmentPickerUsesRouteTeardownBoundaryNotFixedDelay() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("transaction.disablesAnimations = true"))
        XCTAssertFalse(source.contains(".onChange(of: productRoute == nil)"))
        XCTAssertFalse(source.contains("Task.sleep(for: .milliseconds"))
    }

    func testBulkAddRegistersTagsAndMutationsUpdateTimestamp() throws {
        let model = try source("App/AppModel.swift")
        let organization = try source("Core/Models/VaultOrganization.swift")
        XCTAssertTrue(model.contains("for tag in normalizedAddTags { current.vault.tagRegistry.create(name: tag) }"))
        XCTAssertTrue(organization.contains("modifiedAt: Date = Date()"))
        XCTAssertTrue(organization.contains("if changed != item { changed.modifiedAt = modifiedAt }"))
    }
}
