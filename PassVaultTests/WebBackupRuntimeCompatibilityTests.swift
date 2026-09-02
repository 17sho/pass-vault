import XCTest
@testable import PassVault

final class WebBackupRuntimeCompatibilityTests: XCTestCase {
    func testDecodesFixtureProducedByDeployedWebCryptoWithUnicodePassword() throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "web-v1-unicode-password", withExtension: "json"))
        let decoded = try WebBackupImportAdapter.decode(Data(contentsOf: fixture), password: "网页正确主密码-测试🔐")
        XCTAssertEqual(decoded.vault.items.count, 1)
        XCTAssertEqual(decoded.vault.items.first?.kind, .secureNote)
        XCTAssertEqual(decoded.vault.items.first?.title, "网页导出测试")
        XCTAssertEqual(decoded.vault.items.first?.notes, "真实 producer 格式")
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any])
        let entries = try XCTUnwrap(root["envelopes"] as? [[String: Any]])
        XCTAssertTrue(entries.contains { $0["id"] as? String == "recents_registry" })
    }

    func testWrongPasswordIsAuthenticationFailure() throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "web-v1-unicode-password", withExtension: "json"))
        XCTAssertThrowsError(try WebBackupImportAdapter.decode(Data(contentsOf: fixture), password: "错误密码")) { error in
            XCTAssertEqual(error as? VaultCryptoError, .authenticationFailed)
        }
    }

    func testTamperedEntryIsIntegrityFailureNotWrongPassword() throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "web-v1-unicode-password", withExtension: "json"))
        var root = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any])
        var envelopes = try XCTUnwrap(root["envelopes"] as? [[String: Any]])
        var entry = envelopes[1]
        var ciphertext = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(entry["ciphertext"] as? String)))
        ciphertext[ciphertext.startIndex] ^= 1
        entry["ciphertext"] = ciphertext.base64EncodedString()
        envelopes[1] = entry; root["envelopes"] = envelopes
        let tampered = try JSONSerialization.data(withJSONObject: root)
        XCTAssertThrowsError(try WebBackupImportAdapter.decode(tampered, password: "网页正确主密码-测试🔐")) { error in
            XCTAssertEqual(error as? VaultCryptoError, .invalidEnvelope)
        }
    }

    func testVaultItemPersistsWebNoteAttachmentLinks() throws {
        let attachmentID = UUID()
        let noteID = UUID()
        let original = VaultItem(kind: .secureNote, title: "note", attachmentIDs: [attachmentID])
        let attachment = VaultItem(kind: .attachment, title: "file", attachmentNoteID: noteID)
        let decoded = try JSONDecoder().decode([VaultItem].self, from: JSONEncoder().encode([original, attachment]))
        XCTAssertEqual(decoded[0].attachmentIDs, [attachmentID])
        XCTAssertEqual(decoded[1].attachmentNoteID, noteID)
    }

    func testWebCustomFieldIDsAndConditionsAreMapped() throws {
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Storage/WebBackupImportAdapter.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("stableUUID(\"web-field:"))
        XCTAssertTrue(source.contains("CustomFieldCondition(fieldID: sourceID"))
    }

    func testWebImportSessionKeepsDestinationKeyMaterialAndPassword() throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "web-v1-unicode-password", withExtension: "json"))
        let destinationURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: destinationURL) }
        let store = EncryptedVaultStore(url: destinationURL, kdfIterations: 1_000)
        let current = try store.create(password: "current-native-password")

        let imported = try store.importBackupSession(
            Data(contentsOf: fixture),
            password: "网页正确主密码-测试🔐",
            destinationSession: current
        )

        XCTAssertEqual(imported.wrappedKey, current.wrappedKey)
        XCTAssertEqual(try store.unlock(password: "current-native-password").vault.items.first?.title, "网页导出测试")
        XCTAssertThrowsError(try store.unlock(password: "网页正确主密码-测试🔐"))
    }
}
