import XCTest

final class SeventhBatchFeedbackContractTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }
    private func source(_ path: String) throws -> String { try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) }

    func testCustomRecordsUsesHomeContentModeNotProductModalRoute() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("@State private var showingCustomRecords = false"))
        XCTAssertTrue(source.contains("case .customRecords:\n            showCustomRecordsOnHome()"))
        XCTAssertTrue(source.contains("kind: .custom,"))
        XCTAssertFalse(source.contains("case .customRecords\n"))
        XCTAssertFalse(source.contains("pushProductRoute(.customRecords)"))
    }

    func testBulkGroupAndTagsAreIndependentPeerActions() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("Button { bulkChoice = .group }"))
        XCTAssertTrue(source.contains("Button { bulkChoice = .tags }"))
        XCTAssertFalse(source.contains("TextField(t(.tags), text: $bulkTags).textFieldStyle"))
        XCTAssertTrue(source.contains("case .tags:\n                    bulkTagEditor"))
    }

    func testFavoritesTapCallsDetailCallbackExplicitly() throws {
        let source = try source("Features/Vault/VaultViews.swift")
        XCTAssertTrue(source.contains("rowInteraction: .tapOnly, onOpenDetail: { openItemFromProductRoute() })"))
    }

    func testAttachmentImporterUsesStableHostAndProviderTolerantRead() throws {
        let views = try source("Features/Vault/VaultViews.swift")
        let storage = try source("Storage/EncryptedVaultStore.swift")
        XCTAssertTrue(views.contains("passVaultRequestAttachmentImport"))
        let rootView = try source("Features/RootView.swift")
        let coordinator = try source("Features/FileImportCoordinator.swift")
        XCTAssertTrue(coordinator.contains("UIDocumentPickerViewController"))
        XCTAssertTrue(coordinator.contains("AttachmentImportReader.readOwnedData"))
        XCTAssertTrue(storage.contains("NSFileCoordinator.ReadingOptions.withoutChanges") || storage.contains("options: .withoutChanges"))
        let attachmentReaderStart = try XCTUnwrap(storage.range(of: "public enum AttachmentImportReader"))
        let attachmentReaderEnd = try XCTUnwrap(storage.range(of: "public struct BackupPreview", range: attachmentReaderStart.upperBound..<storage.endIndex))
        let attachmentReader = String(storage[attachmentReaderStart.lowerBound..<attachmentReaderEnd.lowerBound])
        XCTAssertTrue(attachmentReader.contains("FileReadPolicy.readData"))
        XCTAssertFalse(attachmentReader.contains("Data(contentsOf: coordinatedURL)"))
    }
}
