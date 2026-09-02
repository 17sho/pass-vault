import CryptoKit
import Foundation

public enum TOTPError: Error, Equatable { case invalidSecret, invalidDigits, invalidPeriod }

public enum TOTP {
    public static func generate(secret: String, date: Date = Date(), digits: Int = 6, period: Int = 30) throws -> String {
        guard (6...8).contains(digits) else { throw TOTPError.invalidDigits }
        guard period > 0 else { throw TOTPError.invalidPeriod }
        guard let keyData = Base32.decode(secret), !keyData.isEmpty else { throw TOTPError.invalidSecret }
        let counter = UInt64(floor(date.timeIntervalSince1970 / Double(period)))
        var bigEndian = counter.bigEndian
        let message = withUnsafeBytes(of: &bigEndian) { Data($0) }
        let hash = Data(HMAC<Insecure.SHA1>.authenticationCode(for: message, using: SymmetricKey(data: keyData)))
        let offset = Int(hash.last! & 0x0f)
        let binary = (UInt32(hash[offset] & 0x7f) << 24) | (UInt32(hash[offset + 1]) << 16) | (UInt32(hash[offset + 2]) << 8) | UInt32(hash[offset + 3])
        let modulo = UInt32(pow(10.0, Double(digits)))
        return String(format: "%0*u", digits, binary % modulo)
    }
}

public enum Base32 {
    private static let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    public static func decode(_ input: String) -> Data? {
        let cleaned = input.uppercased().filter { !$0.isWhitespace && $0 != "-" }.replacingOccurrences(of: "=", with: "")
        guard !cleaned.isEmpty else { return nil }
        var buffer = 0, bits = 0
        var output = Data()
        for character in cleaned {
            guard let value = alphabet.firstIndex(of: character) else { return nil }
            buffer = (buffer << 5) | value; bits += 5
            if bits >= 8 { bits -= 8; output.append(UInt8((buffer >> bits) & 0xff)) }
        }
        return output
    }
}
