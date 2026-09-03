import XCTest
@testable import PassVault

final class Feedback62RecoveryTimestampTests: XCTestCase {
    func testRecoveryMetadataUsesWebCeilingSemanticsForRemainingDays() {
        let deletedAt = Date(timeIntervalSince1970: 1_725_192_000)
        let now = deletedAt.addingTimeInterval(2 * 86_400 + 1)

        let metadata = RecoveryRetentionMetadata(
            deletedAt: deletedAt,
            retentionDays: 30,
            now: now
        )

        XCTAssertEqual(metadata.remainingDays, 28)
        XCTAssertFalse(metadata.isExpired)
    }

    func testRecoveryMetadataMatchesWebPermanentRetention() {
        let metadata = RecoveryRetentionMetadata(
            deletedAt: Date(timeIntervalSince1970: 1_725_192_000),
            retentionDays: 0,
            now: Date(timeIntervalSince1970: 1_900_000_000)
        )

        XCTAssertNil(metadata.expirationDate)
        XCTAssertNil(metadata.remainingDays)
        XCTAssertFalse(metadata.isExpired)
    }

    func testRecoveryRowCopyMatchesWebRemainingOnlyContract() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Features/Vault/VaultViews.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)

        XCTAssertTrue(source.contains("? \"剩余 \\(days) 天\""))
        XCTAssertTrue(source.contains("? \"永久保留\""))
        XCTAssertFalse(source.contains("删除于 \\(deletedText)"))
        XCTAssertFalse(source.contains("isExpiringSoon ? Color.red"))
    }
}
