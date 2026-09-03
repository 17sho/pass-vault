import XCTest

final class Feedback71WebListControlsTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testSearchPromptAdaptsToCurrentCategory() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        for text in ["搜索名称、账号和内容", "搜索名称、网址和内容", "搜索标题和正文", "搜索文件名和标签"] {
            XCTAssertTrue(source.contains(text), "Missing category-specific prompt: \(text)")
        }
        XCTAssertTrue(source.contains("searchPrompt: searchPrompt"))
    }

    func testToolbarShowsCurrentTagAndGroupStateAsText() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("selectedTagCount == 0 ? tagFilterTitle"))
        XCTAssertTrue(source.contains("Text(selectedGroupName)"))
        XCTAssertFalse(source.contains("Label(selectedGroupName, systemImage: \"square.stack.3d.up\").labelStyle(.iconOnly)"))
    }

    func testRecentStripMatchesWebBehavior() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("private var recentItems: [VaultItem]"))
        XCTAssertTrue(source.contains("prefix(5)"))
        XCTAssertTrue(source.contains("最近查看"))
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"recent-items\")"))
    }

    func testAttachmentRowsExposeCategoryAndByteSize() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("attachmentMetadata"))
        XCTAssertTrue(source.contains("formattedAttachmentSize"))
        XCTAssertTrue(source.contains("ByteCountFormatter.string("))
        XCTAssertTrue(source.contains("countStyle: .file"))
        XCTAssertTrue(source.contains("全部附件"))
    }

    func testAttachmentCategoryControlClearsToolbarDivider() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains(".padding(.horizontal, 8).padding(.top, 8).padding(.bottom, 8)"))
    }
}
