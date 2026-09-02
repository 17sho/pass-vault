import Foundation
import XCTest
@testable import PassVault

final class TOTPTests: XCTestCase {
    func testRFC6238SHA1Vectors() throws {
        let secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        let vectors: [(TimeInterval, String)] = [(59, "94287082"), (1_111_111_109, "07081804"), (1_111_111_111, "14050471"), (1_234_567_890, "89005924"), (2_000_000_000, "69279037"), (20_000_000_000, "65353130")]
        for (time, expected) in vectors {
            XCTAssertEqual(try TOTP.generate(secret: secret, date: Date(timeIntervalSince1970: time), digits: 8), expected)
        }
    }

    func testRejectsInvalidBase32AndDigits() {
        XCTAssertThrowsError(try TOTP.generate(secret: "***"))
        XCTAssertThrowsError(try TOTP.generate(secret: "JBSWY3DPEHPK3PXP", digits: 4))
    }
}
