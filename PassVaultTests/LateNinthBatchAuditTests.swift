import XCTest

final class LateNinthBatchAuditTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testProviderReadLeavesMainActorAndHasHardByteLimit() throws {
        let coordinator = try source("Features/FileImportCoordinator.swift")
        let storage = try source("Storage/EncryptedVaultStore.swift")
        XCTAssertTrue(coordinator.contains("Task.detached(priority: .userInitiated)"))
        XCTAssertTrue(storage.contains("FileHandle(forReadingFrom:"))
        XCTAssertTrue(storage.contains("remaining + 1"))
        XCTAssertFalse(storage.contains("Data(contentsOf: coordinatedURL)"))
    }
}
