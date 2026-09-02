import Foundation
import SwiftUI

public enum MoreMenuDestination: String, CaseIterable, Sendable {
    case globalSearch, customRecords, tags, recoveryCenter
    case settings, securityCenter, privacy, theme, groupOrder, pinOrder, bulkGroup
    case localShareManagement, exportBackup, importBackup, changePassword, lock
    case onlineShareManagement, remoteSessions, changeCloudUsername

    public static let localReferenceOrder: [Self] = [
        .globalSearch, .customRecords, .tags, .groupOrder, .pinOrder, .bulkGroup,
        .recoveryCenter, .settings
    ]
    public static let nativeSubstitutions: [Self] = []
    public static let backendRequired: [Self] = [.onlineShareManagement, .remoteSessions, .changeCloudUsername]
}

enum MoreMenuModalSizing {
    static func sizing(_ destination: MoreMenuDestination) -> PVModalSizing {
        switch destination {
        case .privacy, .theme, .localShareManagement,
             .onlineShareManagement, .remoteSessions, .changeCloudUsername,
             .lock:
            .fit
        case .globalSearch, .customRecords, .tags, .recoveryCenter, .settings,
             .securityCenter, .exportBackup, .importBackup, .changePassword:
            .fit
        case .groupOrder, .pinOrder, .bulkGroup:
            .workspace
        }
    }
}

public enum AutoLockChoice: String, CaseIterable, Sendable {
    case oneMinute, fiveMinutes, fifteenMinutes, thirtyMinutes, never

    public var seconds: TimeInterval {
        switch self {
        case .oneMinute: 60
        case .fiveMinutes: 300
        case .fifteenMinutes: 900
        case .thirtyMinutes: 1_800
        case .never: 0
        }
    }
}

public enum ClipboardClearChoice: String, CaseIterable, Sendable {
    case never, fifteenSeconds, thirtySeconds, oneMinute, twoMinutes

    public var seconds: TimeInterval {
        switch self {
        case .never: 0
        case .fifteenSeconds: 15
        case .thirtySeconds: 30
        case .oneMinute: 60
        case .twoMinutes: 120
        }
    }
}

public enum VaultPrivacyLevel: String, CaseIterable, Sendable {
    case off, titles, list, full
}

public struct VaultPrivacyPresentation: Equatable, Sendable {
    public let level: VaultPrivacyLevel
    public init(level: VaultPrivacyLevel) { self.level = level }
    public var hidesTitle: Bool { level == .list || level == .full }
    public var hidesSummary: Bool { level != .off }
    public var hidesDetail: Bool { level == .full }
    public var hidesOrganization: Bool { level == .full }
    public var hidesSearchMetadata: Bool { level != .off }
    public var restrictsSensitiveNavigation: Bool { false }
}

public enum VaultPrivacyNavigationPolicy {
    public static func allows(_ destination: MoreMenuDestination, level: VaultPrivacyLevel) -> Bool { true }
}

public enum VaultThemeChoice: String, CaseIterable, Sendable {
    case system, light, dark
}

public final class LocalVaultPreferences: ObservableObject {
    private enum Key {
        static let autoLock = "vaultAutoLockChoice"
        static let clipboardClear = "vaultClipboardClearChoice"
        static let privacyLevel = "vaultPrivacyLevel"
        static let privacyPersist = "vaultPrivacyPersist"
        static let theme = "vaultThemeChoice"
        static let trashRetentionDays = "vaultTrashRetentionDays"
        static let quickUnlockOptIn = "vaultQuickUnlockOptIn"
    }

    private let defaults: UserDefaults

    @Published public var autoLockChoice: AutoLockChoice { didSet { defaults.set(autoLockChoice.rawValue, forKey: Key.autoLock) } }
    @Published public var clipboardClearChoice: ClipboardClearChoice { didSet { defaults.set(clipboardClearChoice.rawValue, forKey: Key.clipboardClear) } }
    @Published public var privacyLevel: VaultPrivacyLevel
    @Published public var privacyPersist: Bool { didSet { defaults.set(privacyPersist, forKey: Key.privacyPersist) } }
    @Published public var theme: VaultThemeChoice { didSet { defaults.set(theme.rawValue, forKey: Key.theme) } }
    @Published public var trashRetentionDays: Int { didSet { defaults.set(trashRetentionDays, forKey: Key.trashRetentionDays) } }
    @Published public var quickUnlockOptIn: Bool { didSet { defaults.set(quickUnlockOptIn, forKey: Key.quickUnlockOptIn) } }

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        autoLockChoice = defaults.string(forKey: Key.autoLock).flatMap(AutoLockChoice.init(rawValue:)) ?? .fiveMinutes
        clipboardClearChoice = defaults.string(forKey: Key.clipboardClear).flatMap(ClipboardClearChoice.init(rawValue:)) ?? .oneMinute
        let shouldPersistPrivacy = defaults.object(forKey: Key.privacyPersist) as? Bool ?? false
        privacyPersist = shouldPersistPrivacy
        let storedPrivacy = defaults.string(forKey: Key.privacyLevel).flatMap(VaultPrivacyLevel.init(rawValue:)) ?? .off
        privacyLevel = shouldPersistPrivacy ? storedPrivacy : .off
        theme = defaults.string(forKey: Key.theme).flatMap(VaultThemeChoice.init(rawValue:)) ?? .system
        let storedRetention = defaults.object(forKey: Key.trashRetentionDays) as? Int
        trashRetentionDays = storedRetention.flatMap { [0, 7, 30, 90].contains($0) ? $0 : nil } ?? 30
        quickUnlockOptIn = defaults.bool(forKey: Key.quickUnlockOptIn)
    }

    public func persistPrivacyLevel(_ level: VaultPrivacyLevel) {
        defaults.set(level.rawValue, forKey: Key.privacyLevel)
    }
}
