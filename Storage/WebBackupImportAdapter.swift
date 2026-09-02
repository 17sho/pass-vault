import CryptoKit
import Foundation

public struct DecodedWebBackup: Sendable {
    public let createdAt: Date
    public let vault: Vault
}

public enum WebBackupImportAdapter {
    private static let format = "pass-vault-v2"

    public static func recognizes(_ data: Data) -> Bool {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return root["format"] as? String == format
    }

    public static func decode(_ data: Data, password: String) throws -> DecodedWebBackup {
        try BackupPolicy.validateDataSize(data.count)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              root["format"] as? String == format,
              let version = root["version"] as? Int, version == 1 || version == 2,
              let kdf = root["kdf"] as? [String: Any],
              let saltText = kdf["salt"] as? String,
              let iterations = kdf["iterations"] as? Int, iterations == 310_000,
              (kdf["hash"] as? String ?? "SHA-256") == "SHA-256",
              let salt = Data(base64Encoded: saltText), salt.count >= 16,
              let wrapped = root["wrappedKey"] as? [String: Any] else { throw VaultCryptoError.invalidEnvelope }

        var derived = try PasswordKDF.deriveKey(password: password, salt: salt, iterations: iterations)
        defer { derived.resetBytes(in: derived.startIndex..<derived.endIndex) }
        var wrappedPlain: Data
        do { wrappedPlain = try openJSON(wrapped, key: SymmetricKey(data: derived)) }
        catch VaultCryptoError.authenticationFailed { throw VaultCryptoError.authenticationFailed }
        defer { wrappedPlain.resetBytes(in: wrappedPlain.startIndex..<wrappedPlain.endIndex) }
        guard let keyObject = try JSONSerialization.jsonObject(with: wrappedPlain) as? [String: Any],
              let keyText = keyObject["key"] as? String,
              var keyData = Data(base64Encoded: keyText), keyData.count == 32 else { throw VaultCryptoError.invalidEnvelope }
        defer { keyData.resetBytes(in: keyData.startIndex..<keyData.endIndex) }
        let key = SymmetricKey(data: keyData)

        let encryptedEntries = (root[version == 1 ? "envelopes" : "entries"] as? [[String: Any]]) ?? []
        guard encryptedEntries.count <= 10_000 else { throw VaultCryptoError.invalidEnvelope }
        var records: [(id: String, type: String, value: [String: Any])] = []
        var settings: [String: [String: Any]] = [:]
        for envelope in encryptedEntries {
            guard let id = envelope["id"] as? String, let type = envelope["type"] as? String else { throw VaultCryptoError.invalidEnvelope }
            let plain: Data
            do { plain = try openJSON(envelope, key: key) }
            catch VaultCryptoError.authenticationFailed { throw VaultCryptoError.invalidEnvelope }
            let value = try JSONSerialization.jsonObject(with: plain)
            if type == "settings" {
                // The deployed Web producer stores recents_registry as a JSON array.
                // It is advisory history and is intentionally not imported, but its
                // valid array shape must not invalidate an otherwise decryptable backup.
                if id == "recents_registry" {
                    guard value is [[String: Any]] else { throw VaultCryptoError.invalidEnvelope }
                } else {
                    guard let object = value as? [String: Any] else { throw VaultCryptoError.invalidEnvelope }
                    settings[id] = object
                }
            } else {
                guard let object = value as? [String: Any] else { throw VaultCryptoError.invalidEnvelope }
                records.append((id, type, object))
            }
        }

        let groupNames = webGroupNames(settings["settings_registry"])
        let markers = webMarkers(settings["markers_registry"])
        var items = try records.map { try makeItem(id: $0.id, type: $0.type, value: $0.value, groupNames: groupNames, marker: markers["\($0.type):\($0.id)"]) }

        if version == 2 {
            let attachments = (root["attachments"] as? [[String: Any]]) ?? []
            guard attachments.count <= 1_000 else { throw VaultCryptoError.invalidEnvelope }
            for row in attachments {
                items.append(try makeAttachment(row, key: key, groupNames: groupNames, marker: markers["attachment:\(row["id"] as? String ?? "")"]))
            }
        }
        var vault = Vault(items: items)
        vault.normalizeOrganizationReferences()
        let exportedAt = (root["exportedAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
        try BackupPolicy.validateAttachments(in: vault)
        return DecodedWebBackup(createdAt: exportedAt, vault: vault)
    }

    private static func openJSON(_ envelope: [String: Any], key: SymmetricKey) throws -> Data {
        guard let ivText = envelope["iv"] as? String, let cipherText = envelope["ciphertext"] as? String,
              let iv = Data(base64Encoded: ivText), iv.count == 12,
              let ciphertextAndTag = Data(base64Encoded: cipherText), ciphertextAndTag.count >= 16 else { throw VaultCryptoError.invalidEnvelope }
        return try open(iv: iv, ciphertextAndTag: ciphertextAndTag, key: key)
    }

    private static func open(iv: Data, ciphertextAndTag: Data, key: SymmetricKey, aad: Data? = nil) throws -> Data {
        let ciphertext = ciphertextAndTag.dropLast(16), tag = ciphertextAndTag.suffix(16)
        do {
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ciphertext, tag: tag)
            return try AES.GCM.open(box, using: key, authenticating: aad ?? Data())
        } catch { throw VaultCryptoError.authenticationFailed }
    }

    private static func makeItem(id: String, type: String, value: [String: Any], groupNames: [String: String], marker: [String: Any]?) throws -> VaultItem {
        let kind: VaultItemKind = switch type { case "account": .account; case "website": .website; case "note": .secureNote; case "totp": .totp; case "custom": .custom; default: throw VaultCryptoError.invalidEnvelope }
        // The deployed web contract permits empty account platform / website name /
        // note title values. Native detail already renders these as “Untitled”, so an
        // otherwise valid backup must not be rejected merely for an empty display name.
        let title = string(value, type == "account" ? "platform" : type == "website" ? "name" : type == "totp" ? "account" : "title")
        if (type == "totp" || type == "custom") && title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw VaultCryptoError.invalidEnvelope
        }
        let credentials: [VaultCredential]
        if let rows = value["credentials"] as? [[String: Any]], !rows.isEmpty {
            credentials = rows.prefix(20).map { VaultCredential(username: string($0, "username"), password: string($0, "password")) }
        } else { credentials = [VaultCredential(username: string(value, "username"), password: string(value, "password"))] }
        let rawFields = (value[type == "custom" ? "fields" : "customFields"] as? [[String: Any]]) ?? []
        let fieldIDs = Dictionary(uniqueKeysWithValues: rawFields.prefix(20).compactMap { row -> (String, UUID)? in
            guard let id = row["id"] as? String else { return nil }
            return (id, stableUUID("web-field:\(id)"))
        })
        let fields = rawFields.prefix(20).compactMap { row -> CustomField? in
            let name = string(row, "label"); guard !name.isEmpty else { return nil }
            let webID = string(row, "id")
            var condition: CustomFieldCondition?
            if let source = row["condition"] as? [String: Any],
               string(source, "operator") == "equals",
               let sourceID = fieldIDs[string(source, "fieldId")] {
                condition = CustomFieldCondition(fieldID: sourceID, equals: string(source, "value"))
            }
            return CustomField(id: fieldIDs[webID] ?? UUID(), name: name, value: string(row, "value"), type: CustomFieldType(rawValue: string(row, "type")) ?? .text, condition: condition)
        }
        let favorite = (value["favorite"] as? Bool) ?? (marker?["favorite"] as? Bool) ?? false
        let pinned = (value["pinned"] as? Bool) ?? (marker?["pinned"] as? Bool) ?? false
        return VaultItem(
            id: stableUUID(id), kind: kind, title: title, credentials: credentials,
            url: string(value, type == "account" ? "loginUrl" : "url"),
            notes: string(value, type == "note" ? "body" : type == "website" ? "description" : "notes"),
            totpSecret: string(value, "secret"), customFields: fields,
            tags: (value["tags"] as? [String] ?? []).prefix(20).map { $0 },
            group: groupNames[value["groupId"] as? String ?? ""] ?? "",
            isFavorite: favorite, isPinned: pinned,
            deletedAt: millisecondsDate(value["deletedAt"]),
            createdAt: millisecondsDate(value["createdAt"]) ?? Date(),
            modifiedAt: millisecondsDate(value["updatedAt"]) ?? Date(),
            attachmentIDs: (value["attachmentIds"] as? [String] ?? []).prefix(20).map(stableUUID)
        )
    }

    private static func makeAttachment(_ row: [String: Any], key: SymmetricKey, groupNames: [String: String], marker: [String: Any]?) throws -> VaultItem {
        guard let id = row["id"] as? String, let metadataEnvelope = row["metadata"] as? [String: Any],
              let objectText = row["object"] as? String, let encryptedObject = Data(base64Encoded: objectText) else { throw VaultCryptoError.invalidEnvelope }
        if let expected = row["ciphertextSize"] as? Int, expected != encryptedObject.count { throw VaultCryptoError.invalidEnvelope }
        if let digest = row["sha256"] as? String, base64URL(Data(SHA256.hash(data: encryptedObject))) != digest { throw VaultCryptoError.invalidEnvelope }
        let metadataData: Data
        do { metadataData = try openJSON(metadataEnvelope, key: key) }
        catch VaultCryptoError.authenticationFailed { throw VaultCryptoError.invalidEnvelope }
        guard let metadata = try JSONSerialization.jsonObject(with: metadataData) as? [String: Any],
              let contentIVText = metadata["contentIv"] as? String, let contentIV = Data(base64Encoded: contentIVText), contentIV.count == 12 else { throw VaultCryptoError.invalidEnvelope }
        let aad = Data("pass-vault-v2:attachment:1:\(id)".utf8)
        let bytes: Data
        do { bytes = try open(iv: contentIV, ciphertextAndTag: encryptedObject, key: key, aad: aad) }
        catch VaultCryptoError.authenticationFailed { throw VaultCryptoError.invalidEnvelope }
        let name = string(metadata, "name")
        guard !name.isEmpty else { throw VaultCryptoError.invalidEnvelope }
        return VaultItem(id: stableUUID(id), kind: .attachment, title: name, credentials: [], tags: (metadata["tags"] as? [String] ?? []).prefix(20).map { $0 }, group: groupNames[metadata["groupId"] as? String ?? ""] ?? "", isFavorite: (metadata["favorite"] as? Bool) ?? (marker?["favorite"] as? Bool) ?? false, isPinned: (metadata["pinned"] as? Bool) ?? (marker?["pinned"] as? Bool) ?? false, deletedAt: millisecondsDate(metadata["deletedAt"]), createdAt: millisecondsDate(row["createdAt"]) ?? Date(), modifiedAt: millisecondsDate(row["updatedAt"]) ?? Date(), attachmentName: name, attachmentData: bytes, attachmentNoteID: (metadata["noteId"] as? String).map(stableUUID))
    }

    private static func webGroupNames(_ value: [String: Any]?) -> [String: String] {
        guard let value else { return [:] }; var result: [String: String] = [:]
        for rows in value.values.compactMap({ $0 as? [[String: Any]] }) { for row in rows { if let id = row["id"] as? String, let name = row["name"] as? String { result[id] = name } } }
        return result
    }
    private static func webMarkers(_ value: [String: Any]?) -> [String: [String: Any]] {
        guard let rows = value?["items"] as? [[String: Any]] else { return [:] }
        return Dictionary(uniqueKeysWithValues: rows.compactMap { row in guard let type = row["type"] as? String, let id = row["id"] as? String else { return nil }; return ("\(type):\(id)", row) })
    }
    private static func string(_ object: [String: Any], _ key: String) -> String { object[key] as? String ?? "" }
    private static func millisecondsDate(_ value: Any?) -> Date? { (value as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1_000) } }
    private static func stableUUID(_ text: String) -> UUID {
        let digest = Array(SHA256.hash(data: Data(text.utf8)).prefix(16)); var bytes = digest
        bytes[6] = (bytes[6] & 0x0F) | 0x50; bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]))
    }
    private static func base64URL(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
