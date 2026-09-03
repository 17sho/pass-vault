import XCTest

final class Feedback61AttachmentLimitContractTests: XCTestCase {
    private let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()

    func testProductionAttachmentPathHasNoFixedMegabyteGate() throws {
        let model = try source("App/AppModel.swift")
        let coordinator = try source("Features/FileImportCoordinator.swift")
        let storage = try source("Storage/EncryptedVaultStore.swift")
        let models = try source("Core/Models/VaultModels.swift")

        XCTAssertFalse(models.contains("maximumFileBytes"))
        XCTAssertFalse(models.contains("maximumVaultBytes"))
        XCTAssertFalse(storage.contains("maximumBackupBytes"))
        XCTAssertTrue(coordinator.contains("AttachmentImportReader.readOwnedData(from: url)"))
        XCTAssertFalse(coordinator.contains("maximumBytes: AttachmentPolicy"))
        XCTAssertFalse(model.contains("attachmentLimits"))
    }

    func testUserFacingCopyDoesNotPromiseTenOrTwentyFiveMegabyteLimits() throws {
        let localization = try source("App/Localization.swift")
        let composer = try source("Features/Vault/AttachmentImportComposer.swift")
        let userFacingCopy = localization + composer

        XCTAssertFalse(userFacingCopy.contains("单个文件上限 10 MB"))
        XCTAssertFalse(userFacingCopy.contains("总上限 25 MB"))
        XCTAssertFalse(userFacingCopy.contains("Per-file limit 10 MB"))
        XCTAssertFalse(userFacingCopy.contains("total limit 25 MB"))
        XCTAssertFalse(userFacingCopy.contains("单个附件最多 10 MiB"))
        XCTAssertFalse(userFacingCopy.contains("Maximum 10 MiB per attachment"))
        XCTAssertTrue(composer.contains("实际可用容量取决于设备剩余存储空间"))
        XCTAssertTrue(composer.contains("Practical capacity depends on available device storage"))
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }
}