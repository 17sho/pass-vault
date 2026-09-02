import Foundation

public enum TagPolicy {
    public static let maximumNameLength = 100
    public static let maximumTagsPerItem = 20

    public static func normalizedName(_ raw: String) -> String? {
        let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= maximumNameLength,
              !clean.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || CharacterSet.illegalCharacters.contains($0) }) else { return nil }
        return clean
    }

    public static func normalizedSelection(_ names: [String]) -> [String]? {
        var seen = Set<String>()
        var result: [String] = []
        for raw in names {
            guard let clean = normalizedName(raw) else { return nil }
            let key = clean.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            if seen.insert(key).inserted { result.append(clean) }
        }
        return result.count <= maximumTagsPerItem ? result : nil
    }
}

public struct TagDefinition: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var colorHex: String

    public init(id: UUID = UUID(), name: String, colorHex: String = "176B57") {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.colorHex = colorHex
    }
}

public struct TagRegistry: Codable, Equatable, Sendable {
    public private(set) var tags: [TagDefinition]

    private enum CodingKeys: String, CodingKey { case tags }

    public init(tags: [TagDefinition] = []) { self.tags = tags }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        tags = try values.decodeIfPresent([TagDefinition].self, forKey: .tags) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(tags, forKey: .tags)
    }

    public mutating func create(name: String, colorHex: String = "176B57") {
        guard let clean = TagPolicy.normalizedName(name), !tags.contains(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) else { return }
        tags.append(TagDefinition(name: clean, colorHex: colorHex))
    }

    @discardableResult
    public mutating func move(name: String, by offset: Int) -> Bool {
        guard let index = tags.firstIndex(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) else { return false }
        let destination = index + offset
        guard tags.indices.contains(destination) else { return false }
        tags.swapAt(index, destination)
        return true
    }

    public mutating func rename(oldName: String, to newName: String, colorHex: String, items: [VaultItem]) -> [VaultItem] {
        guard let clean = TagPolicy.normalizedName(newName),
              let sourceIndex = tags.firstIndex(where: { $0.name.localizedCaseInsensitiveCompare(oldName) == .orderedSame }) else { return items }
        let destinationIndex = tags.firstIndex(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame })
        if let destinationIndex, destinationIndex != sourceIndex {
            tags[destinationIndex].colorHex = colorHex
            tags.remove(at: sourceIndex)
        } else {
            tags[sourceIndex].name = clean
            tags[sourceIndex].colorHex = colorHex
        }
        return items.map { item in
            var changed = item
            guard let normalized = TagPolicy.normalizedSelection(item.tags.map {
                $0.localizedCaseInsensitiveCompare(oldName) == .orderedSame ? clean : $0
            }) else { return item }
            changed.tags = normalized
            return changed
        }
    }

    public mutating func delete(name: String, items: [VaultItem]) -> [VaultItem] {
        tags.removeAll { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }
        return items.map { item in
            var changed = item
            changed.tags.removeAll { $0.localizedCaseInsensitiveCompare(name) == .orderedSame }
            return changed
        }
    }

}

public struct GroupDefinition: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var name: String

    public init(id: UUID = UUID(), name: String) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public struct GroupRegistry: Codable, Equatable, Sendable {
    public private(set) var groupsByKind: [VaultItemKind: [GroupDefinition]]

    private enum CodingKeys: String, CodingKey { case groupsByKind }

    public init(groupsByKind: [VaultItemKind: [GroupDefinition]] = [:]) { self.groupsByKind = groupsByKind }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        groupsByKind = try values.decodeIfPresent([VaultItemKind: [GroupDefinition]].self, forKey: .groupsByKind) ?? [:]
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(groupsByKind, forKey: .groupsByKind)
    }
    public func groups(for kind: VaultItemKind) -> [GroupDefinition] { groupsByKind[kind] ?? [] }

    public mutating func create(name: String, kind: VaultItemKind) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, !(groupsByKind[kind] ?? []).contains(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) else { return }
        groupsByKind[kind, default: []].append(GroupDefinition(name: clean))
    }

    @discardableResult
    public mutating func rename(groupID: UUID, kind: VaultItemKind, to name: String) -> Bool {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty,
              !(groupsByKind[kind] ?? []).contains(where: { $0.id != groupID && $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }),
              let index = groupsByKind[kind]?.firstIndex(where: { $0.id == groupID }) else { return false }
        groupsByKind[kind]?[index].name = clean
        return true
    }

    @discardableResult
    public mutating func move(groupID: UUID, kind: VaultItemKind, by offset: Int) -> Bool {
        guard let index = groupsByKind[kind]?.firstIndex(where: { $0.id == groupID }) else { return false }
        let destination = index + offset
        guard groupsByKind[kind]?.indices.contains(destination) == true else { return false }
        groupsByKind[kind]?.swapAt(index, destination)
        return true
    }

    public mutating func delete(groupID: UUID, kind: VaultItemKind, items: [VaultItem]) -> [VaultItem] {
        groupsByKind[kind]?.removeAll { $0.id == groupID }
        let key = groupID.uuidString
        return items.map { item in
            guard item.kind == kind, item.group == key else { return item }
            var changed = item
            changed.group = ""
            return changed
        }
    }
}

public struct PinnedOrderRegistry: Codable, Equatable, Sendable {
    public private(set) var itemIDsByKind: [VaultItemKind: [UUID]]

    private enum CodingKeys: String, CodingKey { case itemIDsByKind }

    public init(itemIDsByKind: [VaultItemKind: [UUID]] = [:]) {
        self.itemIDsByKind = itemIDsByKind
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        itemIDsByKind = try values.decodeIfPresent([VaultItemKind: [UUID]].self, forKey: .itemIDsByKind) ?? [:]
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(itemIDsByKind, forKey: .itemIDsByKind)
    }

    public func order(for kind: VaultItemKind) -> [UUID] { itemIDsByKind[kind] ?? [] }

    public mutating func setOrder(_ ids: [UUID], for kind: VaultItemKind) {
        var seen = Set<UUID>()
        itemIDsByKind[kind] = ids.filter { seen.insert($0).inserted }
    }

    public func ordered(_ items: [VaultItem], for kind: VaultItemKind) -> [VaultItem] {
        let candidates = items.filter { !$0.isDeleted && $0.isPinned && $0.kind == kind }
        let byID = Dictionary(uniqueKeysWithValues: candidates.map { ($0.id, $0) })
        let known = order(for: kind).compactMap { byID[$0] }
        let knownIDs = Set(known.map(\.id))
        return known + candidates.filter { !knownIDs.contains($0.id) }
    }

    @discardableResult
    public mutating func move(itemID: UUID, kind: VaultItemKind, by offset: Int, availableItems: [VaultItem]) -> Bool {
        var ids = ordered(availableItems, for: kind).map(\.id)
        guard let index = ids.firstIndex(of: itemID) else { return false }
        let destination = index + offset
        guard ids.indices.contains(destination) else { return false }
        ids.swapAt(index, destination)
        setOrder(ids, for: kind)
        return true
    }
}

enum VaultListFilter: Sendable { case all, favorites, recent, trash }

enum VaultSelectionPolicy {
    static func visibleSelection(_ selection: Set<UUID>, visibleIDs: Set<UUID>) -> Set<UUID> {
        selection.intersection(visibleIDs)
    }
}

enum VaultListPolicy {
    static func items(
        in vault: Vault,
        query: String,
        filter: VaultListFilter,
        category: WebVaultCategory? = nil,
        kind: VaultItemKind? = nil,
        selectedTag: String? = nil,
        selectedGroup: String? = nil,
        attachmentCategory: AttachmentCategory? = nil
    ) -> [VaultItem] {
        var result = vault.search(query, includeDeleted: filter == .trash)
        if let category { result = result.filter { $0.kind == category.kind } }
        if let kind { result = result.filter { $0.kind == kind } }
        if let attachmentCategory {
            result = result.filter {
                $0.kind == .attachment && AttachmentMetadataPolicy.category(name: $0.attachmentName ?? $0.title) == attachmentCategory
            }
        }
        switch filter {
        case .all: result = result.filter { !$0.isDeleted }
        case .favorites: result = result.filter { !$0.isDeleted && $0.isFavorite }
        case .recent: result = result.filter { !$0.isDeleted && $0.lastOpenedAt != nil }
        case .trash: result = result.filter(\.isDeleted)
        }
        if let selectedTag { result = result.filter { $0.tags.contains(selectedTag) } }
        if let selectedGroup { result = result.filter { $0.group == selectedGroup } }
        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return result }
        if filter == .recent { return result.sorted { $0.lastOpenedAt! > $1.lastOpenedAt! } }
        let pinnedKinds = Set(result.filter(\.isPinned).map(\.kind))
        var pinnedRank: [UUID: Int] = [:]
        for pinnedKind in pinnedKinds {
            for (index, item) in vault.pinnedOrder.ordered(result, for: pinnedKind).enumerated() {
                pinnedRank[item.id] = index
            }
        }
        return result.sorted {
            if $0.isPinned != $1.isPinned { return $0.isPinned }
            if $0.isPinned {
                if $0.kind != $1.kind {
                    return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
                }
                let lhsRank = pinnedRank[$0.id] ?? Int.max / 2
                let rhsRank = pinnedRank[$1.id] ?? Int.max / 2
                if lhsRank != rhsRank { return lhsRank < rhsRank }
            }
            return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
        }
    }
}

public enum VaultBulkMutation {
    public static func apply(
        to items: [VaultItem],
        selectedIDs: Set<UUID>,
        favorite: Bool? = nil,
        pinned: Bool? = nil,
        group: String? = nil,
        addTags: [String] = [],
        removeTags: [String] = [],
        moveToTrash: Bool = false,
        restoreFromTrash: Bool = false,
        modifiedAt: Date = Date()
    ) -> [VaultItem] {
        items.map { item in
            guard selectedIDs.contains(item.id) else { return item }
            var changed = item
            if let favorite { changed.isFavorite = favorite }
            if let pinned { changed.isPinned = pinned }
            if let group { changed.group = group }
            if !addTags.isEmpty, let normalized = TagPolicy.normalizedSelection(changed.tags + addTags) { changed.tags = normalized }
            if !removeTags.isEmpty {
                changed.tags.removeAll { existing in
                    removeTags.contains { $0.localizedCaseInsensitiveCompare(existing) == .orderedSame }
                }
            }
            if moveToTrash { changed.moveToTrash() }
            if restoreFromTrash { changed.restoreFromTrash() }
            if changed != item { changed.modifiedAt = modifiedAt }
            return changed
        }
    }
}

public extension Vault {
    mutating func normalizeOrganizationReferences() {
        for index in items.indices {
            let clean = items[index].group.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            if let id = UUID(uuidString: clean) {
                items[index].group = groupRegistry.groups(for: items[index].kind).contains(where: { $0.id == id }) ? id.uuidString : ""
                continue
            }
            groupRegistry.create(name: clean, kind: items[index].kind)
            if let definition = groupRegistry.groups(for: items[index].kind).first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) {
                items[index].group = definition.id.uuidString
            }
        }
    }

    func groupName(for item: VaultItem) -> String {
        guard !item.group.isEmpty else { return "" }
        guard let id = UUID(uuidString: item.group) else { return item.group }
        return groupRegistry.groups(for: item.kind).first(where: { $0.id == id })?.name ?? ""
    }

    @discardableResult
    mutating func upsertAndRegisterOrganization(_ item: VaultItem, recordHistory: Bool = true) -> Bool {
        var normalized = item
        guard let normalizedTags = TagPolicy.normalizedSelection(item.tags) else { return false }
        normalized.tags = normalizedTags
        for tag in normalized.tags { tagRegistry.create(name: tag) }
        let cleanGroup = normalized.group.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanGroup.isEmpty {
            normalized.group = ""
        } else if let id = UUID(uuidString: cleanGroup) {
            normalized.group = groupRegistry.groups(for: normalized.kind).contains(where: { $0.id == id }) ? id.uuidString : ""
        } else {
            groupRegistry.create(name: cleanGroup, kind: normalized.kind)
            normalized.group = groupRegistry.groups(for: normalized.kind)
                .first(where: { $0.name.localizedCaseInsensitiveCompare(cleanGroup) == .orderedSame })?.id.uuidString ?? ""
        }
        upsert(normalized, recordHistory: recordHistory)
        return true
    }

    func liveItems(kind: VaultItemKind? = nil) -> [VaultItem] {
        items.filter { !$0.isDeleted && (kind == nil || $0.kind == kind) }
    }
}
