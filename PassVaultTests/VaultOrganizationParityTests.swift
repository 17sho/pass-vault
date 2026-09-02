import XCTest
@testable import PassVault

final class VaultOrganizationParityTests: XCTestCase {
    func testTagPolicyRejectsOversizedControlAndMoreThanTwentyTags() {
        XCTAssertNil(TagPolicy.normalizedName(String(repeating: "a", count: 101)))
        XCTAssertNil(TagPolicy.normalizedName("bad\u{0001}tag"))
        XCTAssertNil(TagPolicy.normalizedSelection((0...20).map { "tag-\($0)" }))
        XCTAssertEqual(TagPolicy.normalizedSelection([" Work ", "work"]), ["Work"])
    }

    func testOrphanAndWrongKindGroupUUIDFallBackToDefaultInsteadOfBecomingVisibleGroups() {
        let accountGroup = UUID()
        var vault = Vault(
            items: [VaultItem(kind: .website, title: "Site", group: accountGroup.uuidString)],
            groupRegistry: GroupRegistry(groupsByKind: [.account: [GroupDefinition(id: accountGroup, name: "Accounts")]])
        )
        vault.normalizeOrganizationReferences()
        XCTAssertEqual(vault.items.first?.group, "")
        XCTAssertTrue(vault.groupRegistry.groups(for: .website).isEmpty)
    }
    func testCustomRecordsRemainReachableThroughDedicatedSecondaryCollection() {
        let account = VaultItem(kind: .account, title: "GitHub")
        let custom = VaultItem(kind: .custom, title: "护照")
        let vault = Vault(items: [account, custom])

        XCTAssertEqual(vault.liveItems(kind: .custom).map(\.id), [custom.id])
        XCTAssertEqual(WebVaultCategory.allCases.count, 5)
    }

    func testTagRegistryKeepsUnusedTagsAndNormalizesAssignments() {
        var registry = TagRegistry(tags: [TagDefinition(name: "工作", colorHex: "176B57")])
        registry.create(name: "个人", colorHex: "7C3AED")

        XCTAssertEqual(registry.tags.map(\.name), ["工作", "个人"])
        XCTAssertEqual(TagPolicy.normalizedSelection(["工作", "工作", "个人"]), ["工作", "个人"])
    }

    func testRegistryDecodingDefaultsMissingCollections() throws {
        let tags = try JSONDecoder().decode(TagRegistry.self, from: Data(#"{}"#.utf8))
        let groups = try JSONDecoder().decode(GroupRegistry.self, from: Data(#"{}"#.utf8))
        XCTAssertTrue(tags.tags.isEmpty)
        XCTAssertTrue(groups.groups(for: .account).isEmpty)
    }

    func testSavingItemRegistersAssignedTagsAndNamedGroup() {
        var vault = Vault()
        let item = VaultItem(kind: .account, title: "GitHub", tags: ["工作", "工作", "个人"], group: "云服务")
        vault.upsertAndRegisterOrganization(item)
        XCTAssertEqual(vault.tagRegistry.tags.map(\.name), ["工作", "个人"])
        XCTAssertEqual(vault.groupRegistry.groups(for: .account).map(\.name), ["云服务"])
        XCTAssertEqual(vault.items.first?.group, vault.groupRegistry.groups(for: .account).first?.id.uuidString)
    }

    func testLegacyNamedGroupsMigrateToCanonicalRegistryIDsWithoutChangingLabels() {
        var vault = Vault(items: [
            VaultItem(kind: .account, title: "A", group: "生产"),
            VaultItem(kind: .account, title: "B", group: "生产"),
            VaultItem(kind: .website, title: "C", group: "生产")
        ])

        vault.normalizeOrganizationReferences()

        let accountGroup = vault.groupRegistry.groups(for: .account).first
        let websiteGroup = vault.groupRegistry.groups(for: .website).first
        XCTAssertEqual(accountGroup?.name, "生产")
        XCTAssertEqual(websiteGroup?.name, "生产")
        XCTAssertEqual(vault.items[0].group, accountGroup?.id.uuidString)
        XCTAssertEqual(vault.items[1].group, accountGroup?.id.uuidString)
        XCTAssertEqual(vault.items[2].group, websiteGroup?.id.uuidString)
        XCTAssertEqual(vault.groupName(for: vault.items[0]), "生产")
        XCTAssertEqual(vault.search("生产").map(\.id), vault.items.map(\.id))
    }

    func testGroupRegistryKeepsEmptyGroupsPerRecordKindAndDeletionReturnsItemsToDefault() {
        let group = GroupDefinition(name: "云服务")
        var registry = GroupRegistry(groupsByKind: [.account: [group]])
        let grouped = VaultItem(kind: .account, title: "AWS", group: group.id.uuidString)
        let unrelated = VaultItem(kind: .website, title: "Docs", group: group.id.uuidString)

        let result = registry.delete(groupID: group.id, kind: .account, items: [grouped, unrelated])

        XCTAssertTrue(registry.groups(for: .account).isEmpty)
        XCTAssertEqual(result.first { $0.id == grouped.id }?.group, "")
        XCTAssertEqual(result.first { $0.id == unrelated.id }?.group, group.id.uuidString)
    }

    func testBulkMutationCanRestoreSelectedItemsWithoutTouchingOthers() {
        var first = VaultItem(kind: .account, title: "A"); first.moveToTrash()
        var second = VaultItem(kind: .account, title: "B"); second.moveToTrash()
        var third = VaultItem(kind: .account, title: "C"); third.moveToTrash()
        let selection: Set<UUID> = [first.id, second.id]

        let changed = VaultBulkMutation.apply(
            to: [first, second, third],
            selectedIDs: selection,
            restoreFromTrash: true
        )

        XCTAssertTrue(changed.filter { selection.contains($0.id) }.allSatisfy { !$0.isDeleted })
        XCTAssertTrue(changed.first { $0.id == third.id }?.isDeleted == true)
    }

    func testVisibleSelectionDropsItemsHiddenByAFilter() {
        let visible = [UUID(), UUID()]
        let hidden = UUID()
        XCTAssertEqual(VaultSelectionPolicy.visibleSelection(Set(visible + [hidden]), visibleIDs: Set(visible)), Set(visible))
    }

    func testListOrderingPreservesSearchRelevanceAndRecentOrder() {
        var exact = VaultItem(title: "GitHub")
        var prefix = VaultItem(title: "GitHub Work")
        prefix.isPinned = true
        let searched = VaultListPolicy.items(in: Vault(items: [prefix, exact]), query: "github", filter: .all)
        XCTAssertEqual(searched.map(\.id), [exact.id, prefix.id])

        exact.lastOpenedAt = Date(timeIntervalSince1970: 100)
        prefix.lastOpenedAt = Date(timeIntervalSince1970: 200)
        let recent = VaultListPolicy.items(in: Vault(items: [exact, prefix]), query: "", filter: .recent)
        XCTAssertEqual(recent.map(\.id), [prefix.id, exact.id])
    }

    func testBulkPermanentRemovalClearsSelectedItems() throws {
        let first = VaultItem(title: "A")
        let second = VaultItem(title: "B")
        var vault = Vault(items: [first, second])

        vault.removePermanently(ids: [first.id])

        XCTAssertNil(vault.items.first { $0.id == first.id })
        XCTAssertNotNil(vault.items.first { $0.id == second.id })
    }

    func testBulkMutationCanFavoritePinMoveAndTrashSelectedItems() {
        let first = VaultItem(kind: .account, title: "A")
        let second = VaultItem(kind: .account, title: "B")
        let third = VaultItem(kind: .account, title: "C")
        let selection: Set<UUID> = [first.id, second.id]

        let changed = VaultBulkMutation.apply(
            to: [first, second, third],
            selectedIDs: selection,
            favorite: true,
            pinned: true,
            group: "work",
            moveToTrash: true
        )

        for item in changed.filter({ selection.contains($0.id) }) {
            XCTAssertTrue(item.isFavorite)
            XCTAssertTrue(item.isPinned)
            XCTAssertEqual(item.group, "work")
            XCTAssertTrue(item.isDeleted)
        }
        XCTAssertEqual(changed.first { $0.id == third.id }, third)
    }
}
