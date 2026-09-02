import CommonCrypto
import CryptoKit
import Foundation
import Security

public enum VaultCryptoError: Error, Equatable {
    case invalidParameters
    case invalidEnvelope
    case unsupportedVersion
    case authenticationFailed
    case randomGenerationFailed
}

public enum SecureRandom {
    public static func data(count: Int) throws -> Data {
        guard count > 0 else { throw VaultCryptoError.invalidParameters }
        var data = Data(count: count)
        let status = data.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, count, bytes.baseAddress!)
        }
        guard status == errSecSuccess else { throw VaultCryptoError.randomGenerationFailed }
        return data
    }
}

public enum PasswordKDF {
    public static func deriveKey(password: String, salt: Data, iterations: Int, outputByteCount: Int = 32) throws -> Data {
        guard !password.isEmpty, salt.count >= 4,
              let iterationCount = UInt32(exactly: iterations),
              iterationCount > 0,
              iterations <= KeyWrapper.maximumSupportedIterations,
              outputByteCount > 0 else { throw VaultCryptoError.invalidParameters }
        let passwordBytes = Array(password.utf8)
        var output = Data(count: outputByteCount)
        let result = passwordBytes.withUnsafeBytes { passwordBuffer in
            salt.withUnsafeBytes { saltBytes in
                output.withUnsafeMutableBytes { outputBytes in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        passwordBuffer.bindMemory(to: Int8.self).baseAddress,
                        passwordBytes.count,
                        saltBytes.bindMemory(to: UInt8.self).baseAddress,
                        salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        iterationCount,
                        outputBytes.bindMemory(to: UInt8.self).baseAddress,
                        outputByteCount
                    )
                }
            }
        }
        guard result == kCCSuccess else { throw VaultCryptoError.invalidParameters }
        return output
    }
}

public enum VaultCrypto {
    public static func seal(_ plaintext: Data, using key: SymmetricKey) throws -> Data {
        let box = try AES.GCM.seal(plaintext, using: key)
        guard let combined = box.combined else { throw VaultCryptoError.invalidEnvelope }
        return combined
    }

    public static func open(_ combined: Data, using key: SymmetricKey) throws -> Data {
        do { return try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: key) }
        catch { throw VaultCryptoError.authenticationFailed }
    }
}

public struct WrappedVaultKey: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public var version: Int
    public var kdf: String
    public var iterations: Int
    public var salt: Data
    public var sealedKey: Data

    public init(version: Int = currentVersion, kdf: String = "PBKDF2-HMAC-SHA256", iterations: Int, salt: Data, sealedKey: Data) {
        self.version = version; self.kdf = kdf; self.iterations = iterations; self.salt = salt; self.sealedKey = sealedKey
    }
}

public enum KeyWrapper {
    public static let defaultIterations = 600_000
    public static let maximumSupportedIterations = defaultIterations

    public static func wrap(_ vaultKey: SymmetricKey, password: String, iterations: Int = defaultIterations) throws -> WrappedVaultKey {
        let salt = try SecureRandom.data(count: 16)
        var wrappingData = try PasswordKDF.deriveKey(password: password, salt: salt, iterations: iterations)
        defer { wrappingData.resetBytes(in: wrappingData.startIndex..<wrappingData.endIndex) }
        let wrappingKey = SymmetricKey(data: wrappingData)
        var rawKey = vaultKey.withUnsafeBytes { Data($0) }
        defer { rawKey.resetBytes(in: rawKey.startIndex..<rawKey.endIndex) }
        return WrappedVaultKey(iterations: iterations, salt: salt, sealedKey: try VaultCrypto.seal(rawKey, using: wrappingKey))
    }

    public static func unwrap(_ wrapped: WrappedVaultKey, password: String) throws -> SymmetricKey {
        guard wrapped.version == WrappedVaultKey.currentVersion,
              wrapped.kdf == "PBKDF2-HMAC-SHA256",
              UInt32(exactly: wrapped.iterations) != nil,
              wrapped.iterations > 0,
              wrapped.iterations <= maximumSupportedIterations,
              wrapped.salt.count >= 16 else { throw VaultCryptoError.unsupportedVersion }
        var wrappingData = try PasswordKDF.deriveKey(password: password, salt: wrapped.salt, iterations: wrapped.iterations)
        defer { wrappingData.resetBytes(in: wrappingData.startIndex..<wrappingData.endIndex) }
        var raw = try VaultCrypto.open(wrapped.sealedKey, using: SymmetricKey(data: wrappingData))
        defer { raw.resetBytes(in: raw.startIndex..<raw.endIndex) }
        guard raw.count == 32 else { throw VaultCryptoError.invalidEnvelope }
        return raw.withUnsafeBytes { SymmetricKey(data: $0) }
    }
}
