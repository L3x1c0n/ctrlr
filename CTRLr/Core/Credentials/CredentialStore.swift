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

    var displayName: String {
        switch self {
        case .radarr:      return "Radarr"
        case .sonarr:      return "Sonarr"
        case .overseerr:   return "Overseerr"
        case .plex:        return "Plex"
        case .tautulli:    return "Tautulli"
        case .qbittorrent: return "qBittorrent"
        }
    }
}

// MARK: - CredentialStore

final class CredentialStore {
    static let shared = CredentialStore()
    private init() {}

    private let bundleID = "com.attakrit.CTRLr"

    func save(_ config: ServiceConfig, for service: Service) {
        guard let data = try? JSONEncoder().encode(config) else { return }
        let query = searchQuery(service)
        // Delete any existing item(s) first — handles duplicates from prior bad saves
        SecItemDelete(query as CFDictionary)
        var item = searchQuery(service)
        item[kSecValueData as String]      = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    func load(_ service: Service) -> ServiceConfig {
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

    /// Search query — no kSecAttrAccessible so it matches items regardless of their accessibility value.
    private func searchQuery(_ service: Service) -> [String: Any] {
        [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: "\(bundleID).\(service.rawValue)",
            kSecAttrAccount as String: service.rawValue,
        ]
    }
}
