import Foundation

// MARK: - Wire models (private)

private struct QBTorrentList: Decodable {
    // decoded as [QBTorrent]
}

private struct QBTorrent: Decodable {
    let hash:     String
    let name:     String
    let progress: Double
    let dlspeed:  Int
    let upspeed:  Int
    let eta:      Int
    let state:    String
    let size:     Int
    let added_on: Int
}

private struct QBTransferInfo: Decodable {
    let dl_info_speed: Int
    let up_info_speed: Int
}

// MARK: - Public model

struct QBTorrentItem: Identifiable, Hashable {
    let hash:     String
    let name:     String
    let progress: Double
    let dlSpeed:  Int
    let upSpeed:  Int
    let eta:      Int
    let state:    String
    let size:     Int
    let addedOn:  Int

    var id: String { hash }

    var isActiveDownload: Bool {
        ["downloading", "metaDL", "forcedDL", "stalledDL"].contains(state)
    }
    var isPaused: Bool { state.hasPrefix("paused") || state == "stopped" }
    var isSeeding: Bool { ["uploading", "forcedUP"].contains(state) }

    var statusLabel: String {
        switch state {
        case "downloading", "forcedDL": return "Downloading"
        case "uploading",   "forcedUP": return "Seeding"
        case "stalledDL":               return "Stalled ↓"
        case "stalledUP":               return "Stalled ↑"
        case "checkingDL", "checkingUP": return "Checking"
        case "metaDL":                  return "Fetching metadata"
        case "pausedDL", "stopped":     return "Paused"
        case "pausedUP":                return "Paused (done)"
        case "queuedDL":                return "Queued ↓"
        case "queuedUP":                return "Queued ↑"
        case "error", "missingFiles":   return "Error"
        default:                        return state
        }
    }

    var etaFormatted: String {
        guard eta > 0, eta < 8_640_000 else { return "∞" }
        if eta < 3600  { return "\(eta / 60)m" }
        if eta < 86400 { return "\(eta / 3600)h \((eta % 3600) / 60)m" }
        return "\(eta / 86400)d"
    }

    func asDownloadItem() -> DownloadItem {
        DownloadItem(id: "qbt-\(hash)", title: name, mediaType: .movie,
                     progress: progress, dlSpeed: dlSpeed, eta: eta,
                     status: statusLabel, source: .qbittorrent)
    }
}

struct QBTransferStats {
    let dlSpeed: Int
    let ulSpeed: Int
}

// MARK: - QBittorrentClient

@MainActor
final class QBittorrentClient: ObservableObject {
    @Published var torrents:    [QBTorrentItem] = []
    @Published var transferStats = QBTransferStats(dlSpeed: 0, ulSpeed: 0)
    @Published var isConnected  = false
    @Published var error:        String?

    let downloadCompletedPublisher = PassthroughSubjectVoid()

    private var cachedConfig = ServiceConfig()
    private var pollTask: Task<Void, Never>?
    private var session = URLSession(configuration: .default)
    private var previousStates = [String: String]()
    private var statesInitialized = false

    private let downloadingStates: Set<String> = ["downloading", "metaDL", "forcedDL", "stalledDL"]
    private let seedingStates:     Set<String> = ["uploading", "forcedUP"]

    func startPolling() {
        cachedConfig = CredentialStore.shared.load(.qbittorrent)
        pollTask?.cancel()
        // Fresh session so old cookies from previous credentials don't linger
        session = URLSession(configuration: .default)
        isConnected = false
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    func stopPolling() { pollTask?.cancel() }

    private func poll() async {
        let cfg = cachedConfig
        guard cfg.enabled, !cfg.baseURL.isEmpty else {
            isConnected = false; return
        }
        do {
            if !isConnected { try await login(cfg) }
            async let t = fetchTorrents(cfg)
            async let i = fetchTransferInfo(cfg)
            let (newTorrents, info) = try await (t, i)
            torrents = newTorrents.sorted { $0.addedOn > $1.addedOn }
            transferStats = QBTransferStats(dlSpeed: info.dl_info_speed, ulSpeed: info.up_info_speed)
            isConnected   = true
            error         = nil
            detectCompletions(newTorrents)
        } catch {
            isConnected = false
            torrents    = []
            self.error  = error.localizedDescription
        }
    }

    private func detectCompletions(_ new: [QBTorrentItem]) {
        let newStates = Dictionary(uniqueKeysWithValues: new.map { ($0.hash, $0.state) })
        defer { previousStates = newStates; statesInitialized = true }
        guard statesInitialized else { return }
        var anyCompleted = false
        for torrent in new {
            guard let prev = previousStates[torrent.hash],
                  downloadingStates.contains(prev),
                  seedingStates.contains(torrent.state) else { continue }
            anyCompleted = true
            NotificationManager.shared.scheduleDownloadComplete(torrentName: torrent.name)
        }
        if anyCompleted { downloadCompletedPublisher.send() }
    }

    private func login(_ cfg: ServiceConfig) async throws {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/auth/login") else { return }
        let user = cfg.username.addingPercentEncoding(withAllowedCharacters: .urlPasswordAllowed) ?? cfg.username
        let pass = cfg.apiKey.addingPercentEncoding(withAllowedCharacters: .urlPasswordAllowed) ?? cfg.apiKey
        let body = "username=\(user)&password=\(pass)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.httpBody = body.data(using: .utf8)
        let (data, _) = try await session.data(for: req)
        if String(data: data, encoding: .utf8) != "Ok." {
            throw NetworkError.badResponse(403)
        }
        isConnected = true
    }

    private func fetchTorrents(_ cfg: ServiceConfig) async throws -> [QBTorrentItem] {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/torrents/info") else { return [] }
        let (data, _) = try await session.data(from: url)
        let raw = try JSONDecoder().decode([QBTorrent].self, from: data)
        return raw.map { QBTorrentItem(hash: $0.hash, name: $0.name, progress: $0.progress,
                                       dlSpeed: $0.dlspeed, upSpeed: $0.upspeed, eta: $0.eta,
                                       state: $0.state, size: $0.size, addedOn: $0.added_on) }
    }

    private func fetchTransferInfo(_ cfg: ServiceConfig) async throws -> QBTransferInfo {
        guard let url = URL(string: "\(cfg.baseURL)/api/v2/transfer/info") else {
            throw NetworkError.badURL
        }
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(QBTransferInfo.self, from: data)
    }

    func pause(hash: String) { action("pause", hash: hash) }
    func resume(hash: String) { action("resume", hash: hash) }
    func delete(hash: String, deleteFiles: Bool = false) {
        let cfg = cachedConfig
        Task {
            guard let url = URL(string: "\(cfg.baseURL)/api/v2/torrents/delete") else { return }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = "hashes=\(hash)&deleteFiles=\(deleteFiles)".data(using: .utf8)
            _ = try? await session.data(for: req)
        }
    }

    private func action(_ name: String, hash: String) {
        let cfg = cachedConfig
        Task {
            guard let url = URL(string: "\(cfg.baseURL)/api/v2/torrents/\(name)") else { return }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = "hashes=\(hash)".data(using: .utf8)
            _ = try? await session.data(for: req)
        }
    }

    func testConnection(with cfg: ServiceConfig) async -> ConnectionResult {
        guard !cfg.baseURL.isEmpty else { return .failure("No URL configured") }
        do {
            try await login(cfg)
            guard let url = URL(string: "\(cfg.baseURL)/api/v2/app/version") else {
                return .failure("Bad URL")
            }
            let (data, _) = try await session.data(from: url)
            let version = String(data: data, encoding: .utf8) ?? "unknown"
            return .success("qBittorrent \(version.trimmingCharacters(in: .whitespacesAndNewlines))")
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}

// MARK: - Helpers

typealias PassthroughSubjectVoid = _PassthroughSubjectVoid
import Combine
final class _PassthroughSubjectVoid {
    private let subject = PassthroughSubject<Void, Never>()
    func send() { subject.send() }
    func sink(_ handler: @escaping () -> Void) -> AnyCancellable {
        subject.sink { _ in handler() }
    }
}

enum ConnectionResult {
    case success(String)
    case failure(String)
}

func formatBytes(_ bytesPerSec: Int) -> String {
    let d = Double(bytesPerSec)
    if d >= 1_000_000_000 { return String(format: "%.1f GB/s", d / 1_000_000_000) }
    if d >= 1_000_000     { return String(format: "%.1f MB/s", d / 1_000_000) }
    if d >= 1_000         { return String(format: "%.0f KB/s", d / 1_000) }
    return "0 KB/s"
}
