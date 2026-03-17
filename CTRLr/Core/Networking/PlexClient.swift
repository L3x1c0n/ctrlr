import Foundation
import UIKit

// MARK: - Wire models (private)

private struct PlexResponse: Decodable {
    let MediaContainer: PlexContainer
}

private struct PlexContainer: Decodable {
    let size:              Int?
    let version:           String?
    let machineIdentifier: String?
    let Metadata:          [PlexMetadata]?
}

private struct PlexMetadata: Decodable {
    let ratingKey:           String
    let type:                String       // "movie", "episode", "show"
    let title:               String
    let year:                Int?
    let thumb:               String?      // poster path
    let art:                 String?      // backdrop path
    let addedAt:             Int?         // Unix timestamp
    let parentIndex:         Int?         // season number — 0 = Specials
    let grandparentTitle:    String?      // show title (episodes)
    let grandparentThumb:    String?      // show poster path (episodes)
    let grandparentRatingKey: String?     // show ratingKey — reliable dedup key for episodes
    let grandparentYear:     Int?         // show year (episodes)
    let summary:             String?
    let viewCount:           Int?         // > 0 means watched
    let Media:               [PlexMediaStream]?
}

private struct PlexMediaStream: Decodable {
    let videoResolution: String?   // "4k", "1080", "720", "480", "sd"
    let videoCodec:      String?   // "hevc", "h264", "av1"
    let audioCodec:      String?   // "eac3", "ac3", "aac"
    let container:       String?   // "mkv", "mp4"
    let bitrate:         Int?      // kbps
}

// /library/sections — enumerate all libraries on this server
private struct PlexSectionsResponse: Decodable {
    let MediaContainer: PlexSectionsContainer
}

private struct PlexSectionsContainer: Decodable {
    let Directory: [PlexSection]?
}

private struct PlexSection: Decodable {
    let key:   String   // numeric section ID, e.g. "1"
    let type:  String   // "movie" or "show"
    let title: String
}

// plex.tv/api/v2/resources — server discovery when no local URL is configured
private struct PlexResource: Decodable {
    let name:        String
    let provides:    String            // "server" is the one we want
    let connections: [PlexConnection]
}

private struct PlexConnection: Decodable {
    let uri:   String
    let local: Bool
    let relay: Bool
}

// MARK: - PlexClient

@MainActor
final class PlexClient: ObservableObject {
    @Published var recentlyAdded: [PlexRecentItem] = []
    @Published var isConnected = false
    @Published var error: String?

    // Resolved server URL cached after discovery — avoids repeating the resources call
    private var resolvedServerURL: String?

    // Disk cache for recently added — survives app restarts so UI is never blank on launch
    private static let cacheKey = "PlexRecentlyAddedCache"

    private func loadCached() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let items = try? JSONDecoder().decode([PlexRecentItem].self, from: data) else { return }
        recentlyAdded = items
    }

    private func saveCache(_ items: [PlexRecentItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    private var config: ServiceConfig { CredentialStore.shared.load(.plex) }
    var isTokenConfigured: Bool { !CredentialStore.shared.load(.plex).apiKey.isEmpty }
    private var pollTask:  Task<Void, Never>?
    private var retryTask: Task<Void, Never>?

    init() { loadCached() }

    // MARK: - Lifecycle

    /// One-shot fetch — called on launch and settings save.
    func startPolling() {
        resolvedServerURL = nil      // clear cache so settings changes take effect
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    /// One-shot fetch — called on manual pull-to-refresh.
    func refresh() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    /// Called after a Radarr/Sonarr ntfy import event. Re-fetches at increasing
    /// intervals until a newer item appears (Plex scan can lag behind the import).
    /// Delays: 5 → 15 → 30 → 60 → 120s (~4.5 min window total).
    private static let retryDelays: [TimeInterval] = [5, 15, 30, 60, 120]

    func waitForNewItem(newerThan knownNewest: Date) {
        retryTask?.cancel()
        retryTask = Task { [weak self] in
            for delay in Self.retryDelays {
                try? await Task.sleep(for: .seconds(delay))
                guard let self, !Task.isCancelled else { return }
                await self.poll()
                if let newest = self.recentlyAdded.first?.addedAt, newest > knownNewest {
                    return   // new item confirmed — stop retrying
                }
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        retryTask?.cancel()
    }

    // MARK: - Poll

    private func poll() async {
        let cfg = config
        guard cfg.enabled, !cfg.apiKey.isEmpty else {
            isConnected = false; return
        }
        do {
            let serverURL = try await resolveServerURL(cfg)
            let items = try await fetchRecentlyAdded(serverURL: serverURL, token: cfg.apiKey)
            recentlyAdded = items
            saveCache(items)
            isConnected = true
            error = nil
        } catch {
            isConnected = false
            self.error = error.localizedDescription
        }
    }

    // MARK: - Server URL resolution
    //
    // If the user configured a specific base URL (e.g. a local IP or plex.direct address)
    // we use it directly. If baseURL is empty or points to plex.tv we call the resources
    // API to discover the best available connection URL for their server.

    private func resolveServerURL(_ cfg: ServiceConfig) async throws -> String {
        // Use cached value to avoid repeated discovery calls within the same session
        if let cached = resolvedServerURL { return cached }

        let needsDiscovery = cfg.baseURL.isEmpty
            || cfg.baseURL.contains("plex.tv")
            || cfg.baseURL == "https://app.plex.tv"

        if !needsDiscovery {
            resolvedServerURL = cfg.baseURL
            return cfg.baseURL
        }

        let url = try await discoverServerURL(token: cfg.apiKey)
        resolvedServerURL = url
        return url
    }

    private func discoverServerURL(token: String) async throws -> String {
        guard var components = URLComponents(string: "https://plex.tv/api/v2/resources") else {
            throw NetworkError.badURL
        }
        components.queryItems = [
            URLQueryItem(name: "X-Plex-Token",    value: token),
            URLQueryItem(name: "includeHttps",    value: "1"),
            URLQueryItem(name: "includeRelay",    value: "1"),
            URLQueryItem(name: "includeIPv6",     value: "0"),
        ]
        guard let url = components.url else { throw NetworkError.badURL }

        let resources: [PlexResource] = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
        let servers = resources.filter { $0.provides.contains("server") }
        guard let server = servers.first else {
            throw NetworkError.badResponse(404)   // no server found on this account
        }

        // Connection priority: non-relay HTTPS plex.direct > local > relay
        let connections = server.connections
        if let best = connections.first(where: { !$0.relay && !$0.local && $0.uri.hasPrefix("https") }) {
            return best.uri
        }
        if let local = connections.first(where: { $0.local }) {
            return local.uri
        }
        if let relay = connections.first(where: { $0.relay }) {
            return relay.uri
        }
        guard let any = connections.first else {
            throw NetworkError.badResponse(404)
        }
        return any.uri
    }

    // MARK: - Recently Added

    private func fetchRecentlyAdded(serverURL: String, token: String) async throws -> [PlexRecentItem] {
        // Step 1: discover all library sections on this server
        guard var comp = URLComponents(string: "\(serverURL)/library/sections") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [URLQueryItem(name: "X-Plex-Token", value: token)]
        guard let sectionsURL = comp.url else { throw NetworkError.badURL }

        let sectionsResp: PlexSectionsResponse = try await NetworkClient.shared.fetch(sectionsURL, headers: plexHeaders)
        let sections = (sectionsResp.MediaContainer.Directory ?? [])
            .filter { $0.type == "movie" || $0.type == "show" }

        // Step 2: fetch recentlyAdded for each movie/show section concurrently
        var allItems: [PlexRecentItem] = []
        await withTaskGroup(of: [PlexRecentItem].self) { group in
            for section in sections {
                group.addTask { [weak self] in
                    guard let self else { return [] }
                    return (try? await self.fetchSectionRecentlyAdded(
                        serverURL: serverURL, token: token, section: section
                    )) ?? []
                }
            }
            for await items in group {
                allItems.append(contentsOf: items)
            }
        }

        // Step 3: sort by addedAt descending, dedup TV shows, cap at 24
        allItems.sort { $0.addedAt > $1.addedAt }
        var result:      [PlexRecentItem] = []
        var seenShowIDs = Set<String>()
        for item in allItems {
            if item.mediaType == .tv {
                guard seenShowIDs.insert(item.id).inserted else { continue }
            }
            result.append(item)
            if result.count == 24 { break }
        }
        return result
    }

    private func fetchSectionRecentlyAdded(serverURL: String, token: String,
                                           section: PlexSection) async throws -> [PlexRecentItem] {
        guard var comp = URLComponents(string: "\(serverURL)/library/sections/\(section.key)/recentlyAdded") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [
            URLQueryItem(name: "X-Plex-Token",           value: token),
            URLQueryItem(name: "X-Plex-Container-Size",  value: "24"),
            URLQueryItem(name: "X-Plex-Container-Start", value: "0"),
        ]
        guard let url = comp.url else { throw NetworkError.badURL }

        let response: PlexResponse = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
        return (response.MediaContainer.Metadata ?? [])
            .compactMap { map(item: $0, serverURL: serverURL, token: token) }
    }

    private func map(item: PlexMetadata, serverURL: String, token: String) -> PlexRecentItem? {
        let media = item.Media?.first
        switch item.type {
        case "movie":
            let posterURL   = item.thumb.map { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let backdropURL = item.art.map   { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let addedAt     = item.addedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) } ?? Date()
            return PlexRecentItem(
                id: item.ratingKey, title: item.title, subtitle: nil,
                mediaType: .movie, year: item.year,
                posterURL: posterURL, backdropURL: backdropURL,
                addedAt: addedAt, isWatched: (item.viewCount ?? 0) > 0,
                summary: item.summary,
                videoResolution: media?.videoResolution,
                videoCodec: media?.videoCodec,
                audioCodec: media?.audioCodec,
                bitrate: media?.bitrate
            )

        case "episode":
            guard (item.parentIndex ?? 0) > 0 else { return nil }
            let id          = item.grandparentRatingKey ?? item.ratingKey
            let thumbPath   = item.grandparentThumb ?? item.thumb
            let posterURL   = thumbPath.map { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let backdropURL = item.art.map  { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let addedAt     = item.addedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) } ?? Date()
            return PlexRecentItem(
                id: id,
                title:    item.grandparentTitle ?? item.title,
                subtitle: nil,
                mediaType: .tv, year: item.grandparentYear ?? item.year,
                posterURL: posterURL, backdropURL: backdropURL,
                addedAt: addedAt, isWatched: (item.viewCount ?? 0) > 0,
                summary: item.summary,
                videoResolution: media?.videoResolution,
                videoCodec: media?.videoCodec,
                audioCodec: media?.audioCodec,
                bitrate: media?.bitrate
            )

        case "show":
            let posterURL   = item.thumb.map { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let backdropURL = item.art.map   { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let addedAt     = item.addedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) } ?? Date()
            return PlexRecentItem(
                id: item.ratingKey, title: item.title, subtitle: nil,
                mediaType: .tv, year: item.year,
                posterURL: posterURL, backdropURL: backdropURL,
                addedAt: addedAt, isWatched: (item.viewCount ?? 0) > 0,
                summary: item.summary,
                videoResolution: media?.videoResolution,
                videoCodec: media?.videoCodec,
                audioCodec: media?.audioCodec,
                bitrate: media?.bitrate
            )

        default:
            return nil
        }
    }

    // MARK: - Plex request headers
    //
    // X-Plex-Client-Identifier is required by plex.tv API (not the media server).
    // We use a fixed UUID that's stable per app install.

    private var plexHeaders: [String: String] {
        let clientID = (UserDefaults.standard.string(forKey: "plexClientID") ?? {
            let id = UUID().uuidString
            UserDefaults.standard.set(id, forKey: "plexClientID")
            return id
        }())
        return [
            "Accept":                  "application/json",
            "X-Plex-Platform":         "iOS",
            "X-Plex-Platform-Version": UIDevice.current.systemVersion,
            "X-Plex-Device":           UIDevice.current.model,
            "X-Plex-Device-Name":      "CTRLr",
            "X-Plex-Product":          "CTRLr",
            "X-Plex-Version":          "1.0",
            "X-Plex-Client-Identifier": clientID,
        ]
    }

    // MARK: - Test connection

    func testConnection() async -> ConnectionResult {
        await testConnection(with: config)
    }

    func testConnection(with cfg: ServiceConfig) async -> ConnectionResult {
        guard !cfg.apiKey.isEmpty else { return .failure("No token configured") }
        do {
            // Always do fresh discovery for test — don't use cached resolvedServerURL
            let serverURL: String
            let needsDiscovery = cfg.baseURL.isEmpty
                || cfg.baseURL.contains("plex.tv")
                || cfg.baseURL == "https://app.plex.tv"
            if needsDiscovery {
                serverURL = try await discoverServerURL(token: cfg.apiKey)
            } else {
                serverURL = cfg.baseURL
            }
            guard var components = URLComponents(string: "\(serverURL)/identity") else {
                return .failure("Bad URL")
            }
            components.queryItems = [URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey)]
            guard let url = components.url else { return .failure("Bad URL") }
            let response: PlexResponse = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
            let version = response.MediaContainer.version ?? "unknown"
            return .success("Plex \(version) · \(serverURL)")
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}
