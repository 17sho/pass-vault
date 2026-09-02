import SwiftUI
import XCTest
@testable import PassVault

final class WebVisualParityTests: XCTestCase {
    func testDesignTokensMatchWebProductContract() {
        XCTAssertEqual(PVTheme.accentHex, "176B57")
        XCTAssertEqual(PVTheme.accentPressedHex, "0F5645")
        XCTAssertEqual(PVTheme.backgroundHex, "F4F6F8")
        XCTAssertEqual(PVTheme.inkHex, "17202A")
        XCTAssertEqual(PVTheme.mutedHex, "647080")
        XCTAssertEqual(PVTheme.lineHex, "DCE2E8")
        XCTAssertEqual(PVTheme.cornerRadius, 12)
        XCTAssertEqual(PVTheme.minimumControlHeight, 44)
    }

    func testMobileShellUsesWebFiveCategoryContract() {
        XCTAssertEqual(WebVaultCategory.allCases.map(\.rawValue), ["account", "website", "note", "totp", "attachment"])
        XCTAssertEqual(WebVaultCategory.allCases.count, 5)
    }

    func testPrimaryAndSecondaryButtonStylesAreProductOwned() {
        XCTAssertEqual(PVButtonRole.primary.backgroundHex, PVTheme.accentHex)
        XCTAssertEqual(PVButtonRole.secondary.backgroundHex, "FFFFFF")
        XCTAssertEqual(PVButtonRole.destructive.foregroundHex, "B42318")
    }

    func testCoreVaultScreensUseProductOwnedContainers() throws {
        let repositoryRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sourceFiles = [
            repositoryRoot.appendingPathComponent("Features/Vault/VaultViews.swift"),
            repositoryRoot.appendingPathComponent("Features/Vault/VaultEditorAndSettings.swift")
        ]
        let forbiddenStructures = ["Form {", "List {", "NavigationSplitView"]

        for sourceFile in sourceFiles {
            let source = try String(contentsOf: sourceFile, encoding: .utf8)
            for structure in forbiddenStructures {
                XCTAssertFalse(
                    source.contains(structure),
                    "\(sourceFile.lastPathComponent) must not use system \(structure) styling"
                )
            }
        }
    }
}
