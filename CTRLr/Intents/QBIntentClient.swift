import Foundation

// MARK: - QBIntentClient
//
// A lightweight, self-contained qBittorrent client for use in App Intents.
// Performs a fresh login + request per invocation — no persistent polling,
// no @MainActor dependency. Safe to call from any intent context.

actor QBIntentClient {

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpShouldSetCookies       = true
        cfg.timeoutIntervalForRequest  = 10
        cfg.timeoutIntervalForResource = 20
        return URLSession(configuration: cfg)
    }()

    // MARK: - Public API

    func fetchTorrents() async throws -> [TorrentEntity] {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        return try await getTorrents(cfg)
    }

    func transferStats() async throws -> (dlSpeed: Int, ulSpeed: Int) {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        return try await getTransferInfo(cfg)
    }

    func pauseAll() async throws {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        try await torrentAction("pause", hashes: "all", cfg: cfg)
    }

    func resumeAll() async throws {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        try await torrentAction("resume", hashes: "all", cfg: cfg)
    }

    func pause(hash: String) async throws {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        try await torrentAction("pause", hashes: hash, cfg: cfg)
    }

    func resume(hash: String) async throws {
        let cfg = CredentialStore.shared.load(.qbittorrent)
        guard cfg.enabled, !cfg.baseURL.isEmpty else { throw IntentError.notConfigured }
        try await login(cfg)
        try await torrentAction("resume", hashes: hash, cfg: cfg)
    }

    // MARK: - Private

    private func login(_ cfg: ServiceConfig) async throws {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/auth/login") else {
            throw IntentError.badURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = "username=\(cfg.username)&password=\(cfg.apiKey)".data(using: .utf8)
        let (data, _) = try await session.data(for: req)
        guard String(data: data, encoding: .utf8) == "Ok." else { throw IntentError.authFailed }
    }

    private func getTorrents(_ cfg: ServiceConfig) async throws -> [TorrentEntity] {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/torrents/info") else {
            throw IntentError.badURL
        }
        let (data, _) = try await session.data(from: url)
        let raw = try JSONDecoder().decode([RawTorrent].self, from: data)
        return raw.map {
            TorrentEntity(id: $0.hash, name: $0.name,
                          progress: $0.progress, state: $0.state, etaSeconds: $0.eta)
        }
    }

    private func getTransferInfo(_ cfg: ServiceConfig) async throws -> (dlSpeed: Int, ulSpeed: Int) {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/transfer/info") else {
            throw IntentError.badURL
        }
        let (data, _) = try await session.data(from: url)
        struct Info: Decodable { let dl_info_speed: Int; let up_info_speed: Int }
        let info = try JSONDecoder().decode(Info.self, from: data)
        return (info.dl_info_speed, info.up_info_speed)
    }

    private func torrentAction(_ name: String, hashes: String, cfg: ServiceConfig) async throws {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/torrents/\(name)") else {
            throw IntentError.badURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = "hashes=\(hashes)".data(using: .utf8)
        _ = try await session.data(for: req)
    }
}

// MARK: - Wire model (private)

private struct RawTorrent: Decodable {
    let hash:     String
    let name:     String
    let progress: Double
    let state:    String
    let eta:      Int
}

// MARK: - Intent errors

enum IntentError: Error, LocalizedError {
    case notConfigured
    case authFailed
    case badURL

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "qBittorrent is not configured in CTRLr settings"
        case .authFailed:    return "Could not authenticate with qBittorrent"
        case .badURL:        return "Invalid server URL"
        }
    }
}

// MARK: - Speed formatter (shared across intent files)

func formatIntentSpeed(_ bytesPerSec: Int) -> String {
    let d = Double(bytesPerSec)
    if d >= 1_000_000_000 { return String(format: "%.1f GB/s", d / 1_000_000_000) }
    if d >= 1_000_000     { return String(format: "%.1f MB/s", d / 1_000_000) }
    if d >= 1_000         { return String(format: "%.0f KB/s", d / 1_000) }
    return "0 KB/s"
}
