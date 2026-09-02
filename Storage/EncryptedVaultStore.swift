import CryptoKit
import Foundation

public enum BackupPolicyError: Error, Equatable { case fileTooLarge, invalidAttachment }

public enum BackupPolicy {
    // Allows the 25 MB attachment budget plus JSON metadata and base64/AES-GCM overhead.
    public static let maximumBackupBytes = 48 * 1_024 * 1_024

    public static func validateDataSize(_ byteCount: Int) throws {
        guard byteCount >= 0, byteCount <= maximumBackupBytes else { throw BackupPolicyError.fileTooLarge }
    }

    public static func validateAttachments(in vault: Vault) throws {
        var total = 0
        for attachment in vault.items.compactMap(\.attachmentData) {
            guard !attachment.isEmpty,
                  attachment.count <= AttachmentPolicy.maximumFileBytes,
                  total <= AttachmentPolicy.maximumVaultBytes - attachment.count else {
                throw BackupPolicyError.invalidAttachment
            }
            total += attachment.count
        }
    }
}

public enum FileReadPolicy {
    public static func validateRegularFile(at url: URL, maximumBytes: Int) throws {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        if values.isRegularFile == false { throw BackupPolicyError.fileTooLarge }
        if let size = values.fileSize, (size < 0 || size > maximumBytes) {
            throw BackupPolicyError.fileTooLarge
        }
    }

    public static func readData(at url: URL, maximumBytes: Int, options: Data.ReadingOptions = []) throws -> Data {
        try validateRegularFile(at: url, maximumBytes: maximumBytes)
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var result = Data()
        let chunkSize = 64 * 1_024
        while true {
            let remaining = maximumBytes - result.count
            guard remaining >= 0 else { throw BackupPolicyError.fileTooLarge }
            guard let chunk = try handle.read(upToCount: min(chunkSize, remaining + 1)), !chunk.isEmpty else { break }
            result.append(chunk)
            guard result.count <= maximumBytes else { throw BackupPolicyError.fileTooLarge }
        }
        return result
    }
}

enum AttachmentImportError: Error, Equatable {
    case empty, fileTooLarge, unavailable

    func localizedMessage(language: AppLanguage) -> String {
        switch (self, language) {
        case (.empty, .simplifiedChinese): "所选文件为空，无法导入。"
        case (.fileTooLarge, .simplifiedChinese): "附件超过单文件 10 MB 限制。"
        case (.unavailable, .simplifiedChinese): "文件提供商尚未提供该文件，请先在“文件”App中下载后重试。"
        case (.empty, _): "The selected file is empty."
        case (.fileTooLarge, _): "The attachment exceeds the 10 MB per-file limit."
        case (.unavailable, _): "The file provider has not made this file available. Download it in Files and try again."
        }
    }
}

public enum AttachmentImportReader {
    public static func readOwnedData(from url: URL, maximumBytes: Int) throws -> Data {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }

        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var result: Result<Data, Error>?
        coordinator.coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { coordinatedURL in
            result = Result {
                let values = try coordinatedURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
                guard values.isRegularFile != false else { throw AttachmentImportError.unavailable }
                if let size = values.fileSize, size > maximumBytes { throw AttachmentImportError.fileTooLarge }
                let data: Data
                do {
                    data = try FileReadPolicy.readData(at: coordinatedURL, maximumBytes: maximumBytes)
                } catch BackupPolicyError.fileTooLarge {
                    throw AttachmentImportError.fileTooLarge
                }
                guard !data.isEmpty else { throw AttachmentImportError.empty }
                return Data(data)
            }
        }
        if coordinationError != nil { throw AttachmentImportError.unavailable }
        guard let result else { throw AttachmentImportError.unavailable }
        do { return try result.get() }
        catch let error as AttachmentImportError { throw error }
        catch { throw AttachmentImportError.unavailable }
    }
}

public struct BackupPreview: Equatable, Sendable {
    public let createdAt: Date
    public let recordCount: Int
    public let attachmentCount: Int
    public let attachmentBytes: Int
}

public enum BackupScope: Equatable, Sendable { case complete, recordsOnly }

public enum AttachmentPreviewKind: Equatable, Sendable { case text, image, pdf }

public enum AttachmentPreviewPolicy {
    public static func previewKind(name: String, data: Data) -> AttachmentPreviewKind? {
        guard !data.isEmpty else { return nil }
        let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
        if ext == "pdf", data.starts(with: Data("%PDF-".utf8)) { return .pdf }
        if ["png", "jpg", "jpeg", "gif"].contains(ext), isRecognizedImage(data) { return .image }
        if ["txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "toml", "ini", "conf", "config", "env", "log", "swift", "m", "mm", "h", "c", "cc", "cpp", "js", "mjs", "ts", "tsx", "jsx", "html", "css", "scss", "sh", "py", "rb", "go", "rs", "java", "kt", "sql"].contains(ext),
           data.count <= 1_024 * 1_024,
           String(data: data, encoding: .utf8) != nil,
           !data.contains(0) { return .text }
        return nil
    }

    private static func isRecognizedImage(_ data: Data) -> Bool {
        let bytes = [UInt8](data.prefix(12))
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return true }
        if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return true }
        if bytes.starts(with: Array("GIF87a".utf8)) || bytes.starts(with: Array("GIF89a".utf8)) { return true }
        return false
    }
}

public struct EncryptedBackupDocument: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public static let formatIdentifier = "me.23cm.passvault.encrypted-backup"
    public var format: String
    public var version: Int
    public var createdAt: Date
    public var envelope: EncryptedVaultEnvelope

    public init(format: String = Self.formatIdentifier, version: Int = Self.currentVersion, createdAt: Date = Date(), envelope: EncryptedVaultEnvelope) {
        self.format = format; self.version = version; self.createdAt = createdAt; self.envelope = envelope
    }
}

public struct EncryptedVaultEnvelope: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public var version: Int
    public var wrappedKey: WrappedVaultKey
    public var sealedVault: Data
    public init(version: Int = currentVersion, wrappedKey: WrappedVaultKey, sealedVault: Data) {
        self.version = version; self.wrappedKey = wrappedKey; self.sealedVault = sealedVault
    }
}

public struct VaultSession: Sendable {
    public var vault: Vault
    let key: SymmetricKey
    let wrappedKey: WrappedVaultKey
    public init(vault: Vault, key: SymmetricKey, wrappedKey: WrappedVaultKey) {
        self.vault = vault; self.key = key; self.wrappedKey = wrappedKey
    }
    public func withKeyData<T>(_ body: (inout Data) throws -> T) rethrows -> T {
        var data = key.withUnsafeBytes { Data($0) }
        defer { data.resetBytes(in: data.startIndex..<data.endIndex) }
        return try body(&data)
    }
}

public final class EncryptedVaultStore: @unchecked Sendable {
    public let url: URL
    private let kdfIterations: Int
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(url: URL, kdfIterations: Int = KeyWrapper.defaultIterations) {
        self.url = url; self.kdfIterations = kdfIterations
        encoder = JSONEncoder(); decoder = JSONDecoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    public var exists: Bool { FileManager.default.fileExists(atPath: url.path) }

    public func create(password: String) throws -> VaultSession {
        guard !exists else { throw CocoaError(.fileWriteFileExists) }
        let key = SymmetricKey(size: .bits256)
        let wrapped = try KeyWrapper.wrap(key, password: password, iterations: kdfIterations)
        let session = VaultSession(vault: Vault(), key: key, wrappedKey: wrapped)
        try save(session)
        return session
    }

    public func unlock(password: String) throws -> VaultSession {
        let envelope = try decoder.decode(EncryptedVaultEnvelope.self, from: readVaultData())
        guard envelope.version == EncryptedVaultEnvelope.currentVersion else { throw VaultCryptoError.unsupportedVersion }
        let key = try KeyWrapper.unwrap(envelope.wrappedKey, password: password)
        return try unlock(envelope: envelope, key: key)
    }

    public func unlock(vaultKeyData: Data) throws -> VaultSession {
        guard vaultKeyData.count == 32 else { throw VaultCryptoError.invalidEnvelope }
        var keyData = vaultKeyData
        defer { keyData.resetBytes(in: keyData.startIndex..<keyData.endIndex) }
        let envelope = try validatedEnvelope(from: readVaultData())
        let key = keyData.withUnsafeBytes { SymmetricKey(data: $0) }
        return try unlock(envelope: envelope, key: key)
    }

    private func unlock(envelope: EncryptedVaultEnvelope, key: SymmetricKey) throws -> VaultSession {
        var plaintext = try VaultCrypto.open(envelope.sealedVault, using: key)
        defer { plaintext.resetBytes(in: plaintext.startIndex..<plaintext.endIndex) }
        let vault = try decoder.decode(Vault.self, from: plaintext)
        guard vault.version == Vault.currentVersion else { throw VaultCryptoError.unsupportedVersion }
        return VaultSession(vault: vault, key: key, wrappedKey: envelope.wrappedKey)
    }

    public func save(_ session: VaultSession) throws {
        var plaintext = try encoder.encode(session.vault)
        defer { plaintext.resetBytes(in: plaintext.startIndex..<plaintext.endIndex) }
        let envelope = EncryptedVaultEnvelope(wrappedKey: session.wrappedKey, sealedVault: try VaultCrypto.seal(plaintext, using: session.key))
        let encoded = try encoder.encode(envelope)
        try BackupPolicy.validateDataSize(encoded.count)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoded.write(to: url, options: [.atomic, .completeFileProtection])
    }

    public func changePassword(session: VaultSession, newPassword: String) throws -> VaultSession {
        guard newPassword.count >= 8 else { throw VaultCryptoError.invalidParameters }
        let wrapped = try KeyWrapper.wrap(session.key, password: newPassword, iterations: kdfIterations)
        let updated = VaultSession(vault: session.vault, key: session.key, wrappedKey: wrapped)
        try save(updated)
        return updated
    }

    public func exportBackup() throws -> Data {
        let envelope = try validatedEnvelope(from: readVaultData())
        let backup = try encoder.encode(EncryptedBackupDocument(envelope: envelope))
        try BackupPolicy.validateDataSize(backup.count)
        return backup
    }

    public func exportBackup(session: VaultSession, scope: BackupScope) throws -> Data {
        guard scope == .recordsOnly else { return try exportBackup() }
        var recordsOnly = session.vault
        recordsOnly.items.removeAll { $0.kind == .attachment }
        var plaintext = try encoder.encode(recordsOnly)
        defer { plaintext.resetBytes(in: plaintext.startIndex..<plaintext.endIndex) }
        let envelope = EncryptedVaultEnvelope(wrappedKey: session.wrappedKey, sealedVault: try VaultCrypto.seal(plaintext, using: session.key))
        let backup = try encoder.encode(EncryptedBackupDocument(envelope: envelope))
        try BackupPolicy.validateDataSize(backup.count)
        return backup
    }

    public func previewBackup(_ data: Data, password: String) throws -> BackupPreview {
        if WebBackupImportAdapter.recognizes(data) {
            let decoded = try WebBackupImportAdapter.decode(data, password: password)
            let attachments = decoded.vault.items.compactMap(\.attachmentData)
            return BackupPreview(createdAt: decoded.createdAt, recordCount: decoded.vault.items.count, attachmentCount: attachments.count, attachmentBytes: attachments.reduce(0) { $0 + $1.count })
        }
        let (backup, vault) = try openBackup(data, password: password)
        let attachments = vault.items.compactMap(\.attachmentData)
        return BackupPreview(
            createdAt: backup.createdAt,
            recordCount: vault.items.count,
            attachmentCount: attachments.count,
            attachmentBytes: attachments.reduce(0) { $0 + $1.count }
        )
    }

    public func importBackup(_ data: Data, password: String) throws {
        let (backup, _) = try openBackup(data, password: password)
        try dataForEnvelope(backup.envelope).write(to: url, options: [.atomic, .completeFileProtection])
    }

    public func importBackupSession(_ data: Data, password: String, destinationSession: VaultSession? = nil) throws -> VaultSession {
        if WebBackupImportAdapter.recognizes(data) {
            let decoded = try WebBackupImportAdapter.decode(data, password: password)
            guard let destinationSession else { throw VaultCryptoError.invalidParameters }
            let session = VaultSession(vault: decoded.vault, key: destinationSession.key, wrappedKey: destinationSession.wrappedKey)
            try save(session)
            return session
        }
        let (backup, vault) = try openBackup(data, password: password)
        try dataForEnvelope(backup.envelope).write(to: url, options: [.atomic, .completeFileProtection])
        let key = try KeyWrapper.unwrap(backup.envelope.wrappedKey, password: password)
        return VaultSession(vault: vault, key: key, wrappedKey: backup.envelope.wrappedKey)
    }

    private func openBackup(_ data: Data, password: String) throws -> (EncryptedBackupDocument, Vault) {
        try BackupPolicy.validateDataSize(data.count)
        let backup = try decoder.decode(EncryptedBackupDocument.self, from: data)
        guard backup.format == EncryptedBackupDocument.formatIdentifier,
              backup.version == EncryptedBackupDocument.currentVersion else { throw VaultCryptoError.unsupportedVersion }
        let key = try KeyWrapper.unwrap(backup.envelope.wrappedKey, password: password)
        var plaintext = try VaultCrypto.open(backup.envelope.sealedVault, using: key)
        defer { plaintext.resetBytes(in: plaintext.startIndex..<plaintext.endIndex) }
        let vault = try decoder.decode(Vault.self, from: plaintext)
        guard vault.version == Vault.currentVersion else { throw VaultCryptoError.unsupportedVersion }
        try BackupPolicy.validateAttachments(in: vault)
        _ = try validatedEnvelope(from: encoder.encode(backup.envelope))
        return (backup, vault)
    }

    private func validatedEnvelope(from data: Data) throws -> EncryptedVaultEnvelope {
        let envelope = try decoder.decode(EncryptedVaultEnvelope.self, from: data)
        guard envelope.version == EncryptedVaultEnvelope.currentVersion,
              envelope.wrappedKey.version == WrappedVaultKey.currentVersion else { throw VaultCryptoError.unsupportedVersion }
        return envelope
    }

    private func dataForEnvelope(_ envelope: EncryptedVaultEnvelope) throws -> Data {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        return try encoder.encode(envelope)
    }

    private func readVaultData() throws -> Data {
        try FileReadPolicy.readData(at: url, maximumBytes: BackupPolicy.maximumBackupBytes)
    }
}
