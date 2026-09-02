import XCTest
@testable import PassVault

final class MoreMenuParityContractTests: XCTestCase {
    func testMoreMenuMatchesLocalReferenceOrderAndLabelsBackendBoundaries() {
        XCTAssertEqual(MoreMenuDestination.localReferenceOrder, [
            .globalSearch,
            .customRecords,
            .tags,
            .groupOrder,
            .pinOrder,
            .bulkGroup,
            .recoveryCenter,
            .settings
        ])
        XCTAssertEqual(MoreMenuDestination.nativeSubstitutions, [])
        XCTAssertEqual(MoreMenuDestination.backendRequired, [.onlineShareManagement, .remoteSessions, .changeCloudUsername])
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.localShareManagement))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.securityCenter))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.exportBackup))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.importBackup))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.changePassword))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.lock))
        XCTAssertTrue(MoreMenuDestination.localReferenceOrder.contains(.settings))
        XCTAssertFalse(MoreMenuDestination.localReferenceOrder.contains(.privacy))
        XCTAssertEqual(MoreMenuModalSizing.sizing(.theme), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.privacy), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.securityCenter), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.globalSearch), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.tags), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.groupOrder), .workspace)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.changePassword), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.customRecords), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.recoveryCenter), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.exportBackup), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.importBackup), .fit)
        XCTAssertEqual(MoreMenuModalSizing.sizing(.localShareManagement), .fit)
    }

    func testTagRegistrySupportsRenameMergeDeleteAndOrdering() {
        var registry = TagRegistry()
        registry.create(name: "工作", colorHex: "176B57")
        registry.create(name: "个人", colorHex: "7C3AED")
        registry.create(name: "旧标签", colorHex: "DC2626")

        var items = [
            VaultItem(title: "A", tags: ["工作", "旧标签"]),
            VaultItem(title: "B", tags: ["个人", "旧标签"])
        ]
        items = registry.rename(oldName: "旧标签", to: "工作", colorHex: "2563EB", items: items)
        XCTAssertEqual(registry.tags.map(\.name), ["工作", "个人"])
        XCTAssertEqual(registry.tags.first?.colorHex, "2563EB")
        XCTAssertEqual(items[0].tags, ["工作"])
        XCTAssertEqual(Set(items[1].tags), Set(["个人", "工作"]))

        XCTAssertTrue(registry.move(name: "个人", by: -1))
        XCTAssertEqual(registry.tags.map(\.name), ["个人", "工作"])
        items = registry.delete(name: "工作", items: items)
        XCTAssertEqual(registry.tags.map(\.name), ["个人"])
        XCTAssertTrue(items.allSatisfy { !$0.tags.contains("工作") })
    }

    func testGroupRegistrySupportsRenameDeleteAndOrderingWithinType() throws {
        var registry = GroupRegistry()
        registry.create(name: "生产", kind: .account)
        registry.create(name: "个人", kind: .account)
        let production = try XCTUnwrap(registry.groups(for: .account).first)
        var items = [VaultItem(kind: .account, title: "A", group: production.id.uuidString)]

        XCTAssertTrue(registry.rename(groupID: production.id, kind: .account, to: "服务器"))
        XCTAssertEqual(registry.groups(for: .account).first?.name, "服务器")
        XCTAssertTrue(registry.move(groupID: production.id, kind: .account, by: 1))
        XCTAssertEqual(registry.groups(for: .account).last?.id, production.id)
        items = registry.delete(groupID: production.id, kind: .account, items: items)
        XCTAssertEqual(items.first?.group, "")
    }

    func testPinnedOrderKeepsManualOrderPerTypeAndAppendsUnknownPins() {
        let first = VaultItem(kind: .account, title: "A", isPinned: true)
        let second = VaultItem(kind: .account, title: "B", isPinned: true)
        let website = VaultItem(kind: .website, title: "Site", isPinned: true)
        var order = PinnedOrderRegistry()

        order.setOrder([second.id, first.id], for: .account)
        XCTAssertEqual(order.ordered([first, website, second], for: .account).map(\.id), [second.id, first.id])

        let third = VaultItem(kind: .account, title: "C", isPinned: true)
        XCTAssertEqual(order.ordered([first, third, second], for: .account).map(\.id), [second.id, first.id, third.id])
        var vault = Vault(items: [second, first, third], pinnedOrder: order)
        XCTAssertTrue(vault.pinnedOrder.move(itemID: first.id, kind: .account, by: -1, availableItems: vault.items))
        XCTAssertEqual(VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .account).map(\.id), [first.id, second.id, third.id])
        vault.items[2].isPinned = false
        XCTAssertEqual(VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .account).map(\.id), [first.id, second.id, third.id])
    }

    func testMixedKindListOrderingIsDeterministicAndStillKeepsPinsFirst() {
        let account = VaultItem(kind: .account, title: "Zulu", isPinned: true)
        let website = VaultItem(kind: .website, title: "Alpha", isPinned: true)
        let normal = VaultItem(kind: .secureNote, title: "Beta")
        let vault = Vault(items: [normal, account, website])

        XCTAssertEqual(VaultListPolicy.items(in: vault, query: "", filter: .all).map(\.id), [website.id, account.id, normal.id])
    }

    func testPinnedOrderDecodesMissingLegacyValueAndPersistsInVault() throws {
        let legacy = #"{"version":1,"items":[],"history":{},"tagRegistry":{},"groupRegistry":{},"customFieldTemplates":[]}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(Vault.self, from: legacy)
        XCTAssertEqual(decoded.pinnedOrder, PinnedOrderRegistry())

        var vault = decoded
        let id = UUID()
        vault.pinnedOrder.setOrder([id], for: .secureNote)
        let roundTrip = try JSONDecoder().decode(Vault.self, from: JSONEncoder().encode(vault))
        XCTAssertEqual(roundTrip.pinnedOrder.order(for: .secureNote), [id])
    }

    func testPermanentRemovalAlsoPurgesPinnedOrderReferences() {
        let pinned = VaultItem(kind: .account, title: "A", isPinned: true)
        var order = PinnedOrderRegistry(); order.setOrder([pinned.id], for: .account)
        var vault = Vault(items: [pinned], pinnedOrder: order)

        vault.removePermanently(ids: [pinned.id])

        XCTAssertTrue(vault.pinnedOrder.order(for: .account).isEmpty)
    }

    func testLocalPreferencesExposeReferenceChoicesAndPersist() {
        let suite = "MoreMenuParityContractTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = LocalVaultPreferences(defaults: defaults)

        XCTAssertEqual(AutoLockChoice.allCases.map(\.seconds), [60, 300, 900, 1800, 0])
        XCTAssertEqual(ClipboardClearChoice.allCases.map(\.seconds), [0, 15, 30, 60, 120])
        preferences.autoLockChoice = .fifteenMinutes
        preferences.clipboardClearChoice = .twoMinutes
        preferences.privacyLevel = .full
        let notPersisted = LocalVaultPreferences(defaults: defaults)
        XCTAssertEqual(notPersisted.privacyLevel, .off)
        preferences.privacyPersist = true
        preferences.persistPrivacyLevel(preferences.privacyLevel)
        preferences.theme = .dark

        let reloaded = LocalVaultPreferences(defaults: defaults)
        XCTAssertEqual(reloaded.autoLockChoice, .fifteenMinutes)
        XCTAssertEqual(reloaded.clipboardClearChoice, .twoMinutes)
        XCTAssertEqual(reloaded.privacyLevel, .full)
        XCTAssertEqual(reloaded.theme, .dark)
    }

    func testPrivacyLevelsMatchWebVisibilityBoundaries() {
        XCTAssertFalse(VaultPrivacyPresentation(level: .off).hidesSummary)
        XCTAssertFalse(VaultPrivacyPresentation(level: .titles).hidesTitle)
        XCTAssertTrue(VaultPrivacyPresentation(level: .titles).hidesSummary)
        XCTAssertTrue(VaultPrivacyPresentation(level: .list).hidesTitle)
        XCTAssertFalse(VaultPrivacyPresentation(level: .list).hidesDetail)
        XCTAssertTrue(VaultPrivacyPresentation(level: .full).hidesDetail)
        XCTAssertTrue(VaultPrivacyPresentation(level: .full).hidesOrganization)
        XCTAssertTrue(VaultPrivacyPresentation(level: .titles).hidesSearchMetadata)
        XCTAssertFalse(VaultPrivacyPresentation(level: .full).restrictsSensitiveNavigation)
        XCTAssertTrue(VaultPrivacyNavigationPolicy.allows(.globalSearch, level: .titles))
        XCTAssertTrue(VaultPrivacyNavigationPolicy.allows(.tags, level: .full))
        XCTAssertTrue(VaultPrivacyNavigationPolicy.allows(.privacy, level: .full))
        XCTAssertTrue(VaultPrivacyNavigationPolicy.allows(.settings, level: .full))
        XCTAssertTrue(VaultPrivacyNavigationPolicy.allows(.lock, level: .full))
    }
}
