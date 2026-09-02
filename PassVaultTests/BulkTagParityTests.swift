import XCTest
@testable import PassVault

final class BulkTagParityTests: XCTestCase {
    func testBulkTagMutationAddsDeduplicatesAndRemovesCaseInsensitively() {
        let first = VaultItem(title: "A", tags: ["工作"])
        let second = VaultItem(title: "B", tags: ["个人"])

        let added = VaultBulkMutation.apply(
            to: [first, second],
            selectedIDs: [first.id, second.id],
            addTags: ["工作", "紧急"]
        )
        XCTAssertEqual(added[0].tags, ["工作", "紧急"])
        XCTAssertEqual(added[1].tags, ["个人", "工作", "紧急"])

        let removed = VaultBulkMutation.apply(
            to: added,
            selectedIDs: [first.id],
            removeTags: ["紧急"]
        )
        XCTAssertEqual(removed[0].tags, ["工作"])
        XCTAssertEqual(removed[1].tags, ["个人", "工作", "紧急"])
    }
}
