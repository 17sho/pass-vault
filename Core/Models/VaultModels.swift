import Foundation

public enum VaultItemKind: String, Codable, CaseIterable, Sendable, Identifiable {
    case account, website, secureNote, totp, custom, attachment
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .secureNote: "Secure note"
        default: rawValue.capitalized
        }
    }
}

public enum CustomFieldType: String, Codable, CaseIterable, Sendable {
    case text, secret, url, date, textarea, number
}

public struct CustomFieldCondition: Codable, Equatable, Sendable {
    public var fieldID: UUID
    public var equals: String
    public init(fieldID: UUID, equals: String) { self.fieldID = fieldID; self.equals = equals }
}

public struct CustomField: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var value: String
    public var isSecret: Bool {
        get { type == .secret }
        set { if newValue { type = .secret } else if type == .secret { type = .text } }
    }
    public var type: CustomFieldType
    public var condition: CustomFieldCondition?

    public init(id: UUID = UUID(), name: String = "", value: String = "", isSecret: Bool = false, type: CustomFieldType? = nil, condition: CustomFieldCondition? = nil) {
        self.id = id; self.name = name; self.value = value
        self.type = type ?? (isSecret ? .secret : .text)
        self.isSecret = self.type == .secret || isSecret
        self.condition = condition
    }

    private enum CodingKeys: String, CodingKey { case id, name, value, isSecret, type, condition }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try values.decodeIfPresent(String.self, forKey: .name) ?? ""
        value = try values.decodeIfPresent(String.self, forKey: .value) ?? ""
        condition = try values.decodeIfPresent(CustomFieldCondition.self, forKey: .condition)
        let legacySecret = try values.decodeIfPresent(Bool.self, forKey: .isSecret) ?? false
        type = try values.decodeIfPresent(CustomFieldType.self, forKey: .type) ?? (legacySecret ? .secret : .text)
        isSecret = type == .secret || legacySecret
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id); try values.encode(name, forKey: .name); try values.encode(value, forKey: .value)
        try values.encode(isSecret, forKey: .isSecret); try values.encode(type, forKey: .type); try values.encodeIfPresent(condition, forKey: .condition)
    }
}

public enum CustomFieldVisibility {
    public static func isVisible(_ field: CustomField, in fields: [CustomField]) -> Bool {
        isVisible(field, in: fields, visited: [])
    }

    private static func isVisible(_ field: CustomField, in fields: [CustomField], visited: Set<UUID>) -> Bool {
        guard let condition = field.condition else { return true }
        guard !visited.contains(field.id),
              let index = fields.firstIndex(where: { $0.id == field.id }),
              let sourceIndex = fields[..<index].firstIndex(where: { $0.id == condition.fieldID }) else { return false }
        let source = fields[sourceIndex]
        return source.value == condition.equals && isVisible(source, in: fields, visited: visited.union([field.id]))
    }
}

public enum CustomRecordPolicy {
    public static func cloneFields(_ fields: [CustomField]) -> [CustomField] {
        let ids = Dictionary(uniqueKeysWithValues: fields.map { ($0.id, UUID()) })
        return fields.map { field in
            var clone = field
            clone.id = ids[field.id] ?? UUID()
            if let condition = field.condition, let sourceID = ids[condition.fieldID] {
                clone.condition = CustomFieldCondition(fieldID: sourceID, equals: condition.equals)
            } else {
                clone.condition = nil
            }
            return clone
        }
    }
}

public struct BuiltInCustomRecordField: Equatable, Sendable {
    public let name: String
    public let type: CustomFieldType
}

public enum BuiltInCustomRecordTemplate: String, CaseIterable, Identifiable, Sendable {
    case blank
    case bankCard = "bank-card"
    case identity, api, server
    case softwareLicense = "software-license"
    public var id: String { rawValue }

    public var icon: String {
        switch self {
        case .blank: "doc.badge.plus"
        case .bankCard: "creditcard"
        case .identity: "person.text.rectangle"
        case .api: "key"
        case .server: "server.rack"
        case .softwareLicense: "checkmark.seal"
        }
    }

    public var fields: [BuiltInCustomRecordField] {
        let values: [(String, CustomFieldType)] = switch self {
        case .blank: []
        case .bankCard: [("持卡人", .text), ("卡号", .secret), ("有效期", .date), ("安全码", .secret), ("账单地址", .textarea), ("客服电话", .text)]
        case .identity: [("证件号", .secret), ("签发日", .date), ("到期日", .date)]
        case .api: [("Endpoint", .url), ("API Key", .secret), ("API Secret", .secret), ("权限范围", .text), ("到期日期", .date)]
        case .server: [("IP地址", .text), ("SSH端口", .number), ("用户名", .text), ("密码", .secret), ("管理后台", .url)]
        case .softwareLicense: [("许可证", .secret), ("版本", .text), ("到期日", .date)]
        }
        return values.map { BuiltInCustomRecordField(name: $0.0, type: $0.1) }
    }

    public func makeFields() -> [CustomField] { fields.map { CustomField(name: $0.name, type: $0.type) } }

    func displayName(language: AppLanguage) -> String {
        let names: (String, String) = switch self {
        case .blank: ("空白资料", "Blank record")
        case .bankCard: ("银行卡", "Bank card")
        case .identity: ("身份证件", "Identity document")
        case .api: ("API凭据", "API credential")
        case .server: ("服务器", "Server")
        case .softwareLicense: ("软件许可", "Software license")
        }
        return language == .simplifiedChinese ? names.0 : names.1
    }
}

public enum CustomFieldPolicyError: Error, Equatable {
    case rowCount, duplicateID, emptyName, nameTooLong, valueTooLong, controlCharacter
}

public enum CustomFieldPolicy {
    public static func validate(_ fields: [CustomField]) throws {
        guard fields.count <= 20 else { throw CustomFieldPolicyError.rowCount }
        guard Set(fields.map(\.id)).count == fields.count else { throw CustomFieldPolicyError.duplicateID }
        for field in fields {
            let name = field.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { throw CustomFieldPolicyError.emptyName }
            guard name.count <= 80 else { throw CustomFieldPolicyError.nameTooLong }
            guard field.value.count <= 10_000 else { throw CustomFieldPolicyError.valueTooLong }
            guard !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
                throw CustomFieldPolicyError.controlCharacter
            }
            if let condition = field.condition {
                guard let fieldIndex = fields.firstIndex(where: { $0.id == field.id }),
                      fields[..<fieldIndex].contains(where: { $0.id == condition.fieldID }) else { throw CustomFieldPolicyError.duplicateID }
            }
        }
    }
}

public struct SecretFieldPresentation: Equatable, Sendable {
    private let value: String
    public let isSecret: Bool

    public init(field: CustomField) {
        value = field.value
        isSecret = field.isSecret
    }

    public func displayValue(revealed: Bool) -> String {
        isSecret && !revealed ? "••••••••" : value
    }

    public var copyValue: String { value }
}

public enum WebInteractionPolicy {
    public static func shouldDismiss(operationSucceeded: Bool) -> Bool { operationSucceeded }
}

public enum VaultEditorSection: Equatable, Sendable {
    case credentials, website, totp, organization, notes, customFields
}

public enum VaultEditorPolicy {
    public static func canChangeKind(isExistingItem: Bool) -> Bool { !isExistingItem }

    public static func sections(for kind: VaultItemKind) -> [VaultEditorSection] {
        switch kind {
        case .account: [.credentials, .website, .organization, .notes, .customFields]
        case .website: [.website, .organization, .notes, .customFields]
        case .totp: [.totp, .organization, .notes, .customFields]
        case .secureNote, .custom: [.organization, .notes, .customFields]
        case .attachment: []
        }
    }
}

public struct VaultCredential: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var username: String
    public var password: String

    public init(id: UUID = UUID(), username: String = "", password: String = "") {
        self.id = id; self.username = username; self.password = password
    }
}

public enum VaultCredentialPolicyError: Error, Equatable { case rowCount, usernameTooLong, passwordTooLong, incomplete, duplicateID }

public enum VaultCredentialPolicy {
    public static func validate(_ credentials: [VaultCredential]) throws {
        guard (1...20).contains(credentials.count) else { throw VaultCredentialPolicyError.rowCount }
        guard Set(credentials.map(\.id)).count == credentials.count else { throw VaultCredentialPolicyError.duplicateID }
        for credential in credentials {
            guard credential.username.count <= 256 else { throw VaultCredentialPolicyError.usernameTooLong }
            guard credential.password.count <= 4_096 else { throw VaultCredentialPolicyError.passwordTooLong }
            let bothEmpty = credential.username.isEmpty && credential.password.isEmpty
            let bothPresent = !credential.username.isEmpty && !credential.password.isEmpty
            guard bothPresent || (credentials.count == 1 && bothEmpty) else { throw VaultCredentialPolicyError.incomplete }
        }
    }
}

public enum VaultCredentialMoveDirection { case up, down }

public enum VaultCredentialEditorPolicy {
    @discardableResult
    public static func replacePassword(_ password: String, for id: UUID, in credentials: inout [VaultCredential]) -> Bool {
        guard let index = credentials.firstIndex(where: { $0.id == id }) else { return false }
        credentials[index].password = password
        return true
    }

    @discardableResult
    public static func move(_ id: UUID, direction: VaultCredentialMoveDirection, in credentials: inout [VaultCredential]) -> Bool {
        guard let index = credentials.firstIndex(where: { $0.id == id }) else { return false }
        let destination = direction == .up ? index - 1 : index + 1
        guard credentials.indices.contains(destination) else { return false }
        credentials.swapAt(index, destination)
        return true
    }
}

public struct VaultItem: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var kind: VaultItemKind
    public var title: String
    public var credentials: [VaultCredential]
    public var username: String {
        get { credentials.first?.username ?? "" }
        set {
            if credentials.isEmpty { credentials = [VaultCredential(username: newValue)] }
            else { credentials[0].username = newValue }
        }
    }
    public var password: String {
        get { credentials.first?.password ?? "" }
        set {
            if credentials.isEmpty { credentials = [VaultCredential(password: newValue)] }
            else { credentials[0].password = newValue }
        }
    }
    public var url: String
    public var notes: String
    public var totpSecret: String
    public var customFields: [CustomField]
    public var tags: [String]
    public var group: String
    public var isFavorite: Bool
    public var isPinned: Bool
    public var deletedAt: Date?
    public var isDeleted: Bool {
        get { deletedAt != nil }
        set {
            if newValue, deletedAt == nil { deletedAt = Date() }
            if !newValue { deletedAt = nil }
        }
    }
    public var createdAt: Date
    public var modifiedAt: Date
    public var lastOpenedAt: Date?
    public var attachmentName: String?
    public var attachmentData: Data?
    public var attachmentIDs: [UUID]
    public var attachmentNoteID: UUID?

    public init(id: UUID = UUID(), kind: VaultItemKind = .account, title: String = "", username: String = "", password: String = "", credentials: [VaultCredential]? = nil, url: String = "", notes: String = "", totpSecret: String = "", customFields: [CustomField] = [], tags: [String] = [], group: String = "", isFavorite: Bool = false, isPinned: Bool = false, isDeleted: Bool = false, deletedAt: Date? = nil, createdAt: Date = Date(), modifiedAt: Date = Date(), lastOpenedAt: Date? = nil, attachmentName: String? = nil, attachmentData: Data? = nil, attachmentIDs: [UUID] = [], attachmentNoteID: UUID? = nil) {
        self.id = id; self.kind = kind; self.title = title
        self.credentials = credentials ?? [VaultCredential(username: username, password: password)]
        self.url = url; self.notes = notes; self.totpSecret = totpSecret
        self.customFields = customFields; self.tags = tags; self.group = group
        self.isFavorite = isFavorite; self.isPinned = isPinned
        self.deletedAt = deletedAt ?? (isDeleted ? Date() : nil)
        self.createdAt = createdAt; self.modifiedAt = modifiedAt; self.lastOpenedAt = lastOpenedAt
        self.attachmentName = attachmentName; self.attachmentData = attachmentData
        self.attachmentIDs = attachmentIDs; self.attachmentNoteID = attachmentNoteID
    }

    public mutating func moveToTrash(at date: Date = Date()) { deletedAt = date }
    public mutating func restoreFromTrash() { deletedAt = nil }

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, credentials, passwordHistory, username, password, url, notes, totpSecret, customFields, tags, group
        case isFavorite, isPinned, isDeleted, deletedAt, createdAt, modifiedAt, lastOpenedAt, attachmentName, attachmentData, attachmentIDs, attachmentNoteID
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        kind = try values.decode(VaultItemKind.self, forKey: .kind)
        title = try values.decode(String.self, forKey: .title)
        if let canonical = try values.decodeIfPresent([VaultCredential].self, forKey: .credentials) {
            if kind == .account { try VaultCredentialPolicy.validate(canonical) }
            credentials = canonical
        } else {
            credentials = [VaultCredential(
                username: try values.decodeIfPresent(String.self, forKey: .username) ?? "",
                password: try values.decodeIfPresent(String.self, forKey: .password) ?? ""
            )]
        }
        // Legacy passwordHistory is intentionally ignored and never encoded again.
        url = try values.decodeIfPresent(String.self, forKey: .url) ?? ""
        notes = try values.decodeIfPresent(String.self, forKey: .notes) ?? ""
        totpSecret = try values.decodeIfPresent(String.self, forKey: .totpSecret) ?? ""
        customFields = try values.decodeIfPresent([CustomField].self, forKey: .customFields) ?? []
        try CustomFieldPolicy.validate(customFields)
        tags = try values.decodeIfPresent([String].self, forKey: .tags) ?? []
        group = try values.decodeIfPresent(String.self, forKey: .group) ?? ""
        isFavorite = try values.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        isPinned = try values.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false
        createdAt = try values.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        modifiedAt = try values.decodeIfPresent(Date.self, forKey: .modifiedAt) ?? createdAt
        deletedAt = try values.decodeIfPresent(Date.self, forKey: .deletedAt)
        // Legacy files only stored a Boolean and therefore have no trustworthy
        // deletion timestamp. Start a fresh retention window at migration.
        if deletedAt == nil, try values.decodeIfPresent(Bool.self, forKey: .isDeleted) == true { deletedAt = Date() }
        lastOpenedAt = try values.decodeIfPresent(Date.self, forKey: .lastOpenedAt)
        attachmentName = try values.decodeIfPresent(String.self, forKey: .attachmentName)
        attachmentData = try values.decodeIfPresent(Data.self, forKey: .attachmentData)
        attachmentIDs = try values.decodeIfPresent([UUID].self, forKey: .attachmentIDs) ?? []
        attachmentNoteID = try values.decodeIfPresent(UUID.self, forKey: .attachmentNoteID)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(kind, forKey: .kind)
        try values.encode(title, forKey: .title)
        try values.encode(credentials, forKey: .credentials)
        try values.encode(url, forKey: .url)
        try values.encode(notes, forKey: .notes)
        try values.encode(totpSecret, forKey: .totpSecret)
        try values.encode(customFields, forKey: .customFields)
        try values.encode(tags, forKey: .tags)
        try values.encode(group, forKey: .group)
        try values.encode(isFavorite, forKey: .isFavorite)
        try values.encode(isPinned, forKey: .isPinned)
        try values.encodeIfPresent(deletedAt, forKey: .deletedAt)
        try values.encode(createdAt, forKey: .createdAt)
        try values.encode(modifiedAt, forKey: .modifiedAt)
        try values.encodeIfPresent(lastOpenedAt, forKey: .lastOpenedAt)
        try values.encodeIfPresent(attachmentName, forKey: .attachmentName)
        try values.encodeIfPresent(attachmentData, forKey: .attachmentData)
        try values.encode(attachmentIDs, forKey: .attachmentIDs)
        try values.encodeIfPresent(attachmentNoteID, forKey: .attachmentNoteID)
    }
}

public struct TrashRetentionPolicy {
    public static func isExpired(_ item: VaultItem, now: Date = Date(), retentionDays: Int) -> Bool {
        guard retentionDays > 0, let deletedAt = item.deletedAt else { return false }
        return now.timeIntervalSince(deletedAt) >= Double(retentionDays) * 86_400
    }
}

public struct RecoveryRetentionMetadata: Equatable, Sendable {
    public let expirationDate: Date?
    public let remainingDays: Int?
    public let isExpired: Bool

    public init(deletedAt: Date, retentionDays: Int, now: Date = Date()) {
        guard retentionDays > 0 else {
            self.expirationDate = nil
            self.remainingDays = nil
            self.isExpired = false
            return
        }
        let expirationDate = deletedAt.addingTimeInterval(Double(retentionDays) * 86_400)
        self.expirationDate = expirationDate
        let remainingInterval = expirationDate.timeIntervalSince(now)
        self.isExpired = remainingInterval <= 0
        self.remainingDays = max(0, Int(ceil(remainingInterval / 86_400)))
    }
}

public struct CustomFieldTemplateField: Codable, Equatable, Sendable {
    public var name: String
    public var value: String
    public var isSecret: Bool
    public var type: CustomFieldType
    public var conditionFieldIndex: Int?
    public var conditionEquals: String?

    public init(name: String, value: String = "", isSecret: Bool = false, type: CustomFieldType? = nil, conditionFieldIndex: Int? = nil, conditionEquals: String? = nil) {
        self.name = name; self.value = value; self.type = type ?? (isSecret ? .secret : .text); self.isSecret = self.type == .secret || isSecret
        self.conditionFieldIndex = conditionFieldIndex; self.conditionEquals = conditionEquals
    }

    private enum CodingKeys: String, CodingKey { case name, value, isSecret, type, conditionFieldIndex, conditionEquals }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decode(String.self, forKey: .name); value = try values.decodeIfPresent(String.self, forKey: .value) ?? ""
        let legacySecret = try values.decodeIfPresent(Bool.self, forKey: .isSecret) ?? false
        type = try values.decodeIfPresent(CustomFieldType.self, forKey: .type) ?? (legacySecret ? .secret : .text); isSecret = type == .secret || legacySecret
        conditionFieldIndex = try values.decodeIfPresent(Int.self, forKey: .conditionFieldIndex); conditionEquals = try values.decodeIfPresent(String.self, forKey: .conditionEquals)
    }
}

public enum CustomFieldTemplateError: Error, Equatable { case emptyName, duplicateID }

public struct CustomFieldTemplate: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var fields: [CustomFieldTemplateField]

    public init(id: UUID = UUID(), name: String, fields: [CustomFieldTemplateField]) throws {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty, normalizedName.count <= 80 else { throw CustomFieldTemplateError.emptyName }
        let prototypes = fields.map { CustomField(name: $0.name, value: $0.value, type: $0.type) }
        try CustomFieldPolicy.validate(prototypes)
        for (index, field) in fields.enumerated() {
            if let source = field.conditionFieldIndex { guard source >= 0, source < index else { throw CustomFieldTemplateError.duplicateID } }
        }
        self.id = id; self.name = normalizedName; self.fields = fields
    }

    public func makeCustomFields() -> [CustomField] {
        let ids = fields.map { _ in UUID() }
        return fields.enumerated().map { index, field in
            CustomField(id: ids[index], name: field.name, value: field.value, type: field.type, condition: field.conditionFieldIndex.flatMap { source in
                guard source >= 0, source < index else { return nil }
                return CustomFieldCondition(fieldID: ids[source], equals: field.conditionEquals ?? "")
            })
        }
    }

    private enum CodingKeys: String, CodingKey { case id, name, fields }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            id: values.decode(UUID.self, forKey: .id),
            name: values.decode(String.self, forKey: .name),
            fields: values.decode([CustomFieldTemplateField].self, forKey: .fields)
        )
    }
}

public struct Vault: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public var version: Int
    public var items: [VaultItem]
    public var tagRegistry: TagRegistry
    public var groupRegistry: GroupRegistry
    public var pinnedOrder: PinnedOrderRegistry
    public var customFieldTemplates: [CustomFieldTemplate]

    public init(version: Int = currentVersion, items: [VaultItem] = [], tagRegistry: TagRegistry = TagRegistry(), groupRegistry: GroupRegistry = GroupRegistry(), pinnedOrder: PinnedOrderRegistry = PinnedOrderRegistry(), customFieldTemplates: [CustomFieldTemplate] = []) {
        self.version = version
        self.items = items
        self.tagRegistry = tagRegistry
        self.groupRegistry = groupRegistry
        self.pinnedOrder = pinnedOrder
        self.customFieldTemplates = customFieldTemplates
    }

    private enum CodingKeys: String, CodingKey { case version, items, history, tagRegistry, groupRegistry, pinnedOrder, customFieldTemplates }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        version = try values.decode(Int.self, forKey: .version)
        items = try values.decode([VaultItem].self, forKey: .items)
        // Legacy history is intentionally ignored and never encoded again.
        tagRegistry = try values.decodeIfPresent(TagRegistry.self, forKey: .tagRegistry) ?? TagRegistry()
        groupRegistry = try values.decodeIfPresent(GroupRegistry.self, forKey: .groupRegistry) ?? GroupRegistry()
        pinnedOrder = try values.decodeIfPresent(PinnedOrderRegistry.self, forKey: .pinnedOrder) ?? PinnedOrderRegistry()
        customFieldTemplates = try values.decodeIfPresent([CustomFieldTemplate].self, forKey: .customFieldTemplates) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(items, forKey: .items)
        try values.encode(tagRegistry, forKey: .tagRegistry)
        try values.encode(groupRegistry, forKey: .groupRegistry)
        try values.encode(pinnedOrder, forKey: .pinnedOrder)
        try values.encode(customFieldTemplates, forKey: .customFieldTemplates)
    }

    public mutating func upsertCustomFieldTemplate(_ template: CustomFieldTemplate) {
        if let index = customFieldTemplates.firstIndex(where: { $0.id == template.id }) { customFieldTemplates[index] = template }
        else { customFieldTemplates.append(template) }
    }

    public mutating func removeCustomFieldTemplate(id: UUID) {
        customFieldTemplates.removeAll { $0.id == id }
    }

    public mutating func upsert(_ item: VaultItem, recordedAt: Date = Date(), recordHistory: Bool = true) {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        } else {
            items.append(item)
        }
    }

    public mutating func removePermanently(ids: Set<UUID>) {
        items.removeAll { ids.contains($0.id) }
        for kind in VaultItemKind.allCases {
            pinnedOrder.setOrder(pinnedOrder.order(for: kind).filter { !ids.contains($0) }, for: kind)
        }
    }
    public func search(_ query: String, includeDeleted: Bool = false) -> [VaultItem] {
        let needle = Self.normalizedSearchText(query)
        return items.compactMap { item -> (VaultItem, Int, String)? in
            guard includeDeleted || !item.isDeleted else { return nil }
            let title = Self.normalizedSearchText(item.title)
            guard !needle.isEmpty else { return (item, 0, title) }
            let visibleFields = item.customFields.filter { !$0.isSecret && CustomFieldVisibility.isVisible($0, in: item.customFields) }.flatMap { [$0.name, $0.value] }
            let credentialUsernames = item.credentials.map(\.username)
            let groupName: String
            if let id = UUID(uuidString: item.group) {
                groupName = groupRegistry.groups(for: item.kind).first(where: { $0.id == id })?.name ?? ""
            } else {
                groupName = item.group
            }
            let values = [item.title, item.url, item.notes, groupName] + credentialUsernames + item.tags + visibleFields
            let scores = values.compactMap { value -> Int? in
                let normalized = Self.normalizedSearchText(value)
                guard !normalized.isEmpty else { return nil }
                if normalized == needle { return 0 }
                if normalized.hasPrefix(needle) { return 100 + min(normalized.count - needle.count, 50) }
                if let range = normalized.range(of: needle) {
                    let offset = normalized.distance(from: normalized.startIndex, to: range.lowerBound)
                    return 200 + min(offset, 50) + min(normalized.count - needle.count, 50)
                }
                return nil
            }
            guard let score = scores.min() else { return nil }
            return (item, score, title)
        }
        .sorted { ($0.1, $0.2) < ($1.1, $1.2) }
        .map(\.0)
    }

    private static func normalizedSearchText(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .unicodeScalars
            .filter { CharacterSet.alphanumerics.contains($0) }
            .map(String.init)
            .joined()
    }
}

public enum AttachmentCategory: String, Codable, CaseIterable, Sendable { case image, video, other }

public enum AttachmentMetadataPolicy {
    public static func category(name: String) -> AttachmentCategory {
        let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
        if ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tiff"].contains(ext) { return .image }
        if ["mp4", "mov", "m4v", "webm", "avi", "mkv"].contains(ext) { return .video }
        return .other
    }
}

public enum AttachmentPolicyError: Error, Equatable { case empty }

public enum AttachmentPolicy {
    public static func validate(newDataSize: Int, existingBytes: Int) throws {
        guard newDataSize > 0 else { throw AttachmentPolicyError.empty }
        guard existingBytes >= 0 else { throw AttachmentPolicyError.empty }
    }
}
