import Foundation
import Security

// MARK: - ServiceConfig

struct ServiceConfig: Codable, Equatable {
    var baseURL:  String
    var apiKey:   String   // used as password for qBittorrent
    var username: String   // qBittorrent only
    var enabled:  Bool

    init(baseURL: String = "", apiKey: String = "", username: String = "", enabled: Bool = false) {
        self.baseURL  = baseURL
        self.apiKey   = apiKey
        self.username = username
        self.enabled  = enabled
    }
}

// MARK: - Service identifiers

enum Service: String, CaseIterable {
    case radarr       = "radarr"
    case sonarr       = "sonarr"
    case overseerr    = "overseerr"
    case plex         = "plex"
    case tautulli     = "tautulli"
    case qbittorrent  = "qbittorrent"
    case trakt        = "trakt"
    case tmdb         = "tmdb"

    var displayName: String {
        switch self {
        case .radarr:      return "Radarr"
        case .sonarr:      return "Sonarr"
        case .overseerr:   return "Overseerr"
        case .plex:        return "Plex"
        case .tautulli:    return "Tautulli"
        case .qbittorrent: return "qBittorrent"
        case .trakt:       return "Trakt"
        case .tmdb:        return "TMDB"
        }
    }
}

// MARK: - CredentialStore
//
// All Keychain I/O (SecItemCopyMatching / SecItemAdd / SecItemDelete) runs on
// a private serial DispatchQueue — NOT on Swift Concurrency's cooperative thread
// pool — so unsafeForcedSync warnings are never emitted.
//
// Public interface is fully synchronous from the caller's perspective:
//   • load()  — returns instantly from the in-memory cache (no Keychain hit)
//   • save()  — updates the in-memory cache synchronously; Keychain write is
//               fire-and-forget on the background queue

final class CredentialStore {
    static let shared = CredentialStore()

    // Serial queue used for ALL Keychain I/O.
    // DispatchQueue threads are NOT part of Swift Concurrency's cooperative pool,
    // so blocking Keychain calls here will not trigger unsafeForcedSync.
    private let keychainQueue = DispatchQueue(label: "com.attakrit.CTRLr.keychain",
                                              qos: .userInitiated)

    private var cache: [Service: ServiceConfig] = [:]
    private let bundleID = "com.attakrit.CTRLr"

    private init() {
        // Preload all credentials synchronously on the dedicated queue.
        // keychainQueue.sync blocks this thread briefly but runs SecItemCopyMatching
        // on a non-cooperative OS thread — no unsafeForcedSync.
        keychainQueue.sync {
            for service in Service.allCases {
                self.cache[service] = self.keychainRead(service)
            }
        }
    }

    // MARK: - Public API

    /// Returns the credential for `service` from the in-memory cache. Never touches Keychain.
    func load(_ service: Service) -> ServiceConfig {
        cache[service] ?? ServiceConfig()
    }

    /// Updates the in-memory cache immediately, then persists to Keychain asynchronously.
    func save(_ config: ServiceConfig, for service: Service) {
        cache[service] = config
        guard let data = try? JSONEncoder().encode(config) else { return }
        // Capture only value types — no self in closure
        let query = searchQuery(service)
        keychainQueue.async {
            SecItemDelete(query as CFDictionary)
            var item = query
            item[kSecValueData as String]      = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    // MARK: - Private

    private func keychainRead(_ service: Service) -> ServiceConfig {
        var query = searchQuery(service)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let config = try? JSONDecoder().decode(ServiceConfig.self, from: data)
        else { return ServiceConfig() }
        return config
    }

    private func searchQuery(_ service: Service) -> [String: Any] {
        [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: "\(bundleID).\(service.rawValue)",
            kSecAttrAccount as String: service.rawValue,
        ]
    }
}
