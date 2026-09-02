import XCTest

final class SecondRoundFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testPhoneDetailStaysInsidePersistentVaultShell() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertFalse(source.contains("case detail(VaultItem)"), "Ordinary detail must not be a product modal route")
        XCTAssertTrue(source.contains("private var phoneContentPane"))
        XCTAssertTrue(source.contains("VaultProductHeader("))
        XCTAssertTrue(source.contains("WebCategoryBar(selection: $category)"))
    }

    func testDetailHasNoEmptyMoreActionOrBlankFieldCard() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertFalse(source.contains("item-more-menu"))
        XCTAssertFalse(source.contains("showingDetailActions"))
        XCTAssertTrue(source.contains("private var hasVisibleDetailContent"))
    }

    func testTagManagementAndFilterShareEntireRegistry() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("private var availableTags: [TagDefinition] { model.vault.tagRegistry.tags }"))
        XCTAssertFalse(source.contains("let used = Set(model.vault.items.flatMap(\\.tags)"))
        XCTAssertTrue(source.contains("PVTagIdentityRow"))
    }

    func testRowsUseCustomSwipeDeleteWithoutRedundantChevron() throws {
        let vault = try source("Features/Vault/VaultViews.swift")
        let more = try source("Features/Vault/MoreMenuLocalViews.swift")
        XCTAssertTrue(vault.contains("PVSwipeDeleteRow"))
        XCTAssertTrue(more.contains("PVSwipeDeleteRow"))
        XCTAssertFalse(vault.contains("Image(systemName: \"chevron.right\")"))
    }

    func testEllipsisUsesProductOwnedAnchoredMenu() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("PVAnchoredItemMenu"))
        XCTAssertFalse(source.contains("itemActionSheet"))
        XCTAssertFalse(source.contains(".pvWebModal(item: $pendingActionItem"))
    }

    func testProductionHasNoSystemProductSelectors() throws {
        for directory in ["App", "Core", "Features", "Storage"] {
            let base = root.appendingPathComponent(directory)
            let enumerator = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
            while let url = enumerator?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                let source = try String(contentsOf: url, encoding: .utf8)
                XCTAssertFalse(source.range(of: #"\bMenu\s*\{"#, options: .regularExpression) != nil)
                XCTAssertFalse(source.contains(".contextMenu"))
                XCTAssertFalse(source.contains(".confirmationDialog"))
                XCTAssertFalse(source.contains(".popover("))
            }
        }
    }
}
