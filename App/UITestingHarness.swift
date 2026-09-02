#if DEBUG
import Foundation

/// A launch-only environment for XCUITest. Every run gets a new directory under
/// the process temporary directory and never opens the production vault path.
@MainActor
enum UITestingHarness {
    static let launchArgument = "-ui-testing"
    static let unlockedLaunchArgument = "-ui-testing-unlocked"
    static let privacyLaunchArgument = "-ui-testing-privacy"
    static let masterPassword = "UITest-Only-Password"

    static func makeModel(languageStore: AppLanguageStore, preferences: LocalVaultPreferences) -> AppModel? {
        guard ProcessInfo.processInfo.arguments.contains(launchArgument) else { return nil }
        languageStore.language = .english
        if ProcessInfo.processInfo.arguments.contains(privacyLaunchArgument) {
            preferences.privacyLevel = .full
        }

        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PassVault-UITests", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let store = EncryptedVaultStore(
            url: root.appendingPathComponent("fixture-vault.pv", isDirectory: false),
            kdfIterations: 1_000
        )
        let model = AppModel(store: store, quickUnlock: UITestingQuickUnlockStore(), languageStore: languageStore, preferences: preferences)
        guard model.setup(password: masterPassword) else { return nil }
        for item in fixtureItems {
            guard model.save(item) else { return nil }
        }
        if !ProcessInfo.processInfo.arguments.contains(unlockedLaunchArgument) {
            model.lock()
            // A freshly launched isolated fixture is already foreground-active; unlike a
            // production background lock there is no later scene transition to clear the shield.
            model.privacyShielded = false
        }
        model.autoLockSeconds = 3_600
        return model
    }

    private static let fixtureItems: [VaultItem] = [
        VaultItem(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000001")!,
            kind: .account,
            title: "Demo Bank Account",
            username: "demo.user@example.test",
            password: "Example-Only-Password",
            url: "https://bank.example.test",
            notes: "Synthetic UI-test record. No production information.",
            customFields: [CustomField(name: "Support PIN", value: "000000", isSecret: true)],
            tags: ["demo", "finance"],
            group: "Examples",
            isFavorite: true,
            isPinned: true
        ),
        VaultItem(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000002")!,
            kind: .website,
            title: "Example Website",
            username: "sample@example.test",
            password: "Synthetic-Website-Password",
            url: "https://www.example.test",
            notes: "Public placeholder data only.",
            tags: ["demo"],
            group: "Examples"
        ),
        VaultItem(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000003")!,
            kind: .secureNote,
            title: "Example Recovery Note",
            notes: "This is intentionally fake screenshot content.",
            tags: ["demo"],
            group: "Examples"
        ),
        VaultItem(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000004")!,
            kind: .totp,
            title: "Example Authenticator",
            username: "totp@example.test",
            totpSecret: "JBSWY3DPEHPK3PXP",
            tags: ["demo"],
            group: "Examples"
        ),
        VaultItem(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000005")!,
            kind: .attachment,
            title: "example-document.txt",
            tags: ["demo"],
            group: "Examples",
            attachmentName: "example-document.txt",
            attachmentData: Data("Synthetic attachment for UI testing.\n".utf8)
        )
    ]
}

private struct UITestingQuickUnlockStore: QuickUnlockStoring {
    var isEnabled: Bool { false }
    func enable(vaultKeyData: Data) throws {}
    func disable() throws {}
    func retrieve(reason: String) async throws -> Data { throw QuickUnlockError.unavailable }
}
#endif
