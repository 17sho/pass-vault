import CryptoKit
import XCTest
@testable import PassVault

final class VaultCryptoTests: XCTestCase {
    func testAESGCMRoundTripAndTamperRejection() throws {
        let key = SymmetricKey(size: .bits256)
        let plaintext = Data("top secret".utf8)
        let sealed = try VaultCrypto.seal(plaintext, using: key)
        XCTAssertEqual(try VaultCrypto.open(sealed, using: key), plaintext)

        var tampered = sealed
        tampered[tampered.index(before: tampered.endIndex)] ^= 1
        XCTAssertThrowsError(try VaultCrypto.open(tampered, using: key))
    }

    func testPBKDF2MatchesKnownSHA256Vector() throws {
        let result = try PasswordKDF.deriveKey(password: "password", salt: Data("salt".utf8), iterations: 2, outputByteCount: 32)
        XCTAssertEqual(result.hex, "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43")
    }

    func testPBKDF2RejectsUnsupportedIterationCountsWithoutIntegerConversionTrap() {
        XCTAssertThrowsError(try PasswordKDF.deriveKey(password: "password", salt: Data("salt".utf8), iterations: Int.max))
        XCTAssertThrowsError(try PasswordKDF.deriveKey(password: "password", salt: Data("salt".utf8), iterations: Int(UInt32.max)))
        XCTAssertThrowsError(try PasswordKDF.deriveKey(password: "password", salt: Data("salt".utf8), iterations: KeyWrapper.maximumSupportedIterations + 1))
    }

    func testWrappedKeyRejectsIterationCountAboveCurrentFormatLimitBeforeKDF() {
        let malicious = WrappedVaultKey(
            iterations: Int.max,
            salt: Data(repeating: 0, count: 16),
            sealedKey: Data()
        )
        XCTAssertThrowsError(try KeyWrapper.unwrap(malicious, password: "password")) { error in
            XCTAssertEqual(error as? VaultCryptoError, .unsupportedVersion)
        }
    }

    func testWrappedKeyRejectsWrongPassword() throws {
        let key = SymmetricKey(size: .bits256)
        let wrapped = try KeyWrapper.wrap(key, password: "correct", iterations: 1_000)
        XCTAssertNoThrow(try KeyWrapper.unwrap(wrapped, password: "correct"))
        XCTAssertThrowsError(try KeyWrapper.unwrap(wrapped, password: "wrong"))
    }
}

private extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
