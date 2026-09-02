import Foundation
import LocalAuthentication
import Security

public enum QuickUnlockError: Error { case unavailable, keychain(OSStatus), invalidData }

public protocol QuickUnlockStoring: Sendable {
    var isEnabled: Bool { get }
    func enable(vaultKeyData: Data) throws
    func disable() throws
    func retrieve(reason: String) async throws -> Data
}

public final class KeychainQuickUnlockStore: QuickUnlockStoring, @unchecked Sendable {
    private let service: String
    private let account = "device-quick-unlock-vault-key"

    public init(service: String = Bundle.main.bundleIdentifier ?? "me.23cm.passvault.local") { self.service = service }

    public var isEnabled: Bool {
        let context = LAContext()
        context.interactionNotAllowed = true
        var query = baseQuery
        query[kSecReturnData as String] = false
        query[kSecUseAuthenticationContext as String] = context
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    public func enable(vaultKeyData: Data) throws {
        guard vaultKeyData.count == 32 else { throw QuickUnlockError.invalidData }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.userPresence], &error) else {
            throw QuickUnlockError.unavailable
        }
        try disable()
        var query = baseQuery
        query[kSecValueData as String] = vaultKeyData
        query[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw QuickUnlockError.keychain(status) }
    }

    public func disable() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw QuickUnlockError.keychain(status) }
    }

    public func retrieve(reason: String) async throws -> Data {
        let context = LAContext()
        context.localizedFallbackTitle = reason == "解锁密码保险库" ? "使用主密码" : "Use master password"
        context.localizedCancelTitle = reason == "解锁密码保险库" ? "取消" : "Cancel"
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecUseAuthenticationContext as String] = context
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { throw QuickUnlockError.keychain(status) }
        guard let data = result as? Data, data.count == 32 else { throw QuickUnlockError.invalidData }
        return data
    }

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
