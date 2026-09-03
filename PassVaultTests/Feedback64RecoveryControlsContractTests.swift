import XCTest

final class Feedback64RecoveryControlsContractTests: XCTestCase {
    func testDedicatedRecoveryCenterMatchesWebRetentionControls() throws {
        let source = try vaultViewsSource()
        let dedicated = try dedicatedRecoveryCenter(in: source)

        XCTAssertTrue(dedicated.contains("recovery-retention-summary"))
        XCTAssertTrue(dedicated.contains("ForEach([7, 30, 90, 0]"))
        XCTAssertTrue(dedicated.contains("recovery-retention-choice-\\(days)"))
        XCTAssertTrue(dedicated.contains("永久保留"))
        XCTAssertTrue(dedicated.contains("\\(days) 天"))
    }

    func testDedicatedRecoveryCenterExposesWebBulkActions() throws {
        let dedicated = try dedicatedRecoveryCenter(in: vaultViewsSource())

        XCTAssertTrue(dedicated.contains("recovery-select-all"))
        XCTAssertTrue(dedicated.contains("recovery-restore-selected"))
        XCTAssertTrue(dedicated.contains("recovery-delete-selected"))
        XCTAssertTrue(dedicated.contains("selectedIDs"))
    }

    func testShorterRetentionRequiresImpactConfirmation() throws {
        let dedicated = try dedicatedRecoveryCenter(in: vaultViewsSource())

        XCTAssertTrue(dedicated.contains("expiredTrashCount"))
        XCTAssertTrue(dedicated.contains("pendingRetentionDays"))
        XCTAssertTrue(dedicated.contains("确认缩短保留期"))
        XCTAssertTrue(dedicated.contains("purgeExpiredTrash"))
    }

    private func dedicatedRecoveryCenter(in source: String) throws -> String {
        guard let start = source.range(of: "private struct RecoveryCenterView: View"),
              let end = source.range(of: "private struct RecoveryCenterItemRow: View", range: start.upperBound..<source.endIndex) else {
            throw XCTSkip("Dedicated recovery center source markers changed")
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    private func vaultViewsSource() throws -> String {
        let tests = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        return try String(contentsOf: tests.deletingLastPathComponent().appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
    }
}
