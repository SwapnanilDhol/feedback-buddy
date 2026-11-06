import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import Security

/// Stores a random UUID in the Keychain (this device only, after first
/// unlock) so the same installation is recognisable across launches while
/// staying pseudonymous. Deleting the app removes it.
///
/// If the Keychain is unavailable (for example a missing entitlement in an
/// unhosted test bundle or an app extension without a keychain group), the
/// identifier falls back to `UserDefaults` so feedback can still be sent.
public final class KeychainInstallationIdentifier: FeedbackInstallationIdentifying, @unchecked Sendable {
    private let service: String
    private let account = "installation-id"
    private let lock = NSLock()
    private let fallbackDefaults: UserDefaults
    private var cached: UUID?

    public init(
        bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "app",
        fallbackDefaults: UserDefaults = .standard
    ) {
        service = "\(bundleIdentifier).feedbackbuddy"
        self.fallbackDefaults = fallbackDefaults
    }

    private var fallbackKey: String { "\(service).installation-id" }

    public func installationID() async throws -> UUID {
        try identifier()
    }

    public func identifier() throws -> UUID {
        lock.lock()
        defer { lock.unlock() }
        if let cached { return cached }
        do {
            let identifier = try keychainIdentifier()
            cached = identifier
            return identifier
        } catch {
            let identifier = fallbackIdentifier()
            cached = identifier
            return identifier
        }
    }

    private func keychainIdentifier() throws -> UUID {
        if let existing = try readIdentifier() {
            return existing
        }
        let identifier = UUID()
        let status = SecItemAdd(
            [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: account,
                kSecAttrSynchronizable: false,
                kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                kSecValueData: Data(identifier.uuidString.utf8),
            ] as CFDictionary,
            nil
        )
        if status == errSecDuplicateItem, let existing = try readIdentifier() {
            return existing
        }
        guard status == errSecSuccess else { throw StoreError.keychain(status) }
        return identifier
    }

    private func fallbackIdentifier() -> UUID {
        if let stored = fallbackDefaults.string(forKey: fallbackKey), let identifier = UUID(uuidString: stored) {
            return identifier
        }
        let identifier = UUID()
        fallbackDefaults.set(identifier.uuidString, forKey: fallbackKey)
        return identifier
    }

    private func readIdentifier() throws -> UUID? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(
            [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: account,
                kSecAttrSynchronizable: false,
                kSecReturnData: true,
                kSecMatchLimit: kSecMatchLimitOne,
            ] as CFDictionary,
            &item
        )
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              let identifier = UUID(uuidString: value)
        else { throw StoreError.keychain(status) }
        return identifier
    }

    public enum StoreError: Error {
        case keychain(OSStatus)
    }
}

/// Non-persistent identifier for tests and SwiftUI previews.
public struct InMemoryInstallationIdentifier: FeedbackInstallationIdentifying {
    public let id: UUID

    public init(id: UUID = UUID()) {
        self.id = id
    }

    public func installationID() async throws -> UUID { id }
}
#endif
