import CryptoKit
import Foundation
import XCTest
@testable import PassVault

final class EncryptedVaultStoreTests: XCTestCase {
    private func temporaryURL() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    func testSetupSaveRestartAndUnlockRoundTrip() throws {
        let url = temporaryURL()
        let store = EncryptedVaultStore(url: url, kdfIterations: 1_000)
        var session = try store.create(password: "master")
        session.vault.items.append(VaultItem(kind: .website, title: "Example", username: "alice", password: "secret"))
        try store.save(session)

        let reopened = try EncryptedVaultStore(url: url, kdfIterations: 1_000).unlock(password: "master")
        XCTAssertEqual(reopened.vault.items.first?.password, "secret")
        XCTAssertThrowsError(try store.unlock(password: "wrong"))
    }

    func testTamperingFailsClosedWithoutOverwritingFile() throws {
        let url = temporaryURL()
        let store = EncryptedVaultStore(url: url, kdfIterations: 1_000)
        try store.save(store.create(password: "master"))
        var bytes = try Data(contentsOf: url)
        bytes[bytes.index(before: bytes.endIndex)] ^= 1
        try bytes.write(to: url)
        let tampered = try Data(contentsOf: url)
        XCTAssertThrowsError(try store.unlock(password: "master"))
        XCTAssertEqual(try Data(contentsOf: url), tampered)
    }

    func testUnsupportedEnvelopeVersionIsRejected() throws {
        let url = temporaryURL()
        let invalid = EncryptedVaultEnvelope(version: 0, wrappedKey: WrappedVaultKey(iterations: 1, salt: Data(repeating: 0, count: 16), sealedKey: Data()), sealedVault: Data())
        try JSONEncoder().encode(invalid).write(to: url)
        XCTAssertThrowsError(try EncryptedVaultStore(url: url).unlock(password: "master"))
    }
}
