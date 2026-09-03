import XCTest

final class Feedback73ClipboardSettingsTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testRealSettingsDirectlyExposeClipboardSecurityChoice() throws {
        let source = try source("Features/Vault/VaultEditorAndSettings.swift")
        XCTAssertTrue(source.contains("struct SettingsView: View"))
        XCTAssertTrue(source.contains("剪贴板自动清除"))
        XCTAssertTrue(source.contains("$preferences.clipboardClearChoice"))
        XCTAssertTrue(source.contains("ClipboardClearChoice.allCases"))
        XCTAssertTrue(source.contains("settings-clipboard-choice"))
    }

    func testCopyUsesSelectedDelayAndOnlyClearsOwnedClipboard() throws {
        let source = try source("App/AppModel.swift")
        XCTAssertTrue(source.contains("preferences.clipboardClearChoice.seconds"))
        XCTAssertTrue(source.contains("UIPasteboard.general.changeCount == count"))
        XCTAssertTrue(source.contains("ClipboardPolicy.options(expirationDate: expiration)"))
    }
}
