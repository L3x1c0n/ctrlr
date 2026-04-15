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
    let ratingKey:            String
    let type:                 String       // "movie", "episode", "show"
    let title:                String
    let year:                 Int?
    let thumb:                String?      // poster path
    let art:                  String?      // backdrop path
    let addedAt:              Int?         // Unix timestamp
    let lastViewedAt:         Int?         // Unix timestamp of last play
    let parentIndex:          Int?         // season number — 0 = Specials
    let parentTitle:          String?      // season name — "Specials" in non-standard setups
    let grandparentTitle:     String?      // show title (episodes)
    let grandparentThumb:     String?      // show poster path (episodes)
    let grandparentRatingKey: String?      // show ratingKey — reliable dedup key for episodes
    let grandparentYear:      Int?         // show year (episodes)
    let summary:              String?
    let viewCount:            Int?         // > 0 means watched
    let librarySectionTitle:  String?      // e.g. "Movies", "TV Shows"
    let Media:                [PlexMediaStream]?
}

private struct PlexMediaStream: Decodable {
    let videoResolution: String?   // "4k", "1080", "720", "480", "sd"
    let videoCodec:      String?   // "hevc", "h264", "av1"
    let audioCodec:      String?   // "eac3", "ac3", "aac"
    let container:       String?   // "mkv", "mp4"
    let bitrate:         Int?      // kbps
    let Part:            [PlexPart]?
}

private struct PlexPart: Decodable {
    let size: Int64?   // bytes
    let file: String?
}

// /library/sections — enumerate all libraries on this server
private struct PlexSectionsResponse: Decodable {
    let MediaContainer: PlexSectionsContainer
}

private struct PlexSectionsContainer: Decodable {
    let machineIdentifier: String?
    let Directory:         [PlexSection]?
}

private struct PlexSection: Decodable {
    let key:   String   // numeric section ID, e.g. "1"
    let type:  String   // "movie" or "show"
    let title: String
}

// /library/metadata/{ratingKey}/matches — candidate matches for Fix Match

private struct PlexMatchesResponse: Decodable {
    let MediaContainer: PlexMatchesContainer
}

private struct PlexMatchesContainer: Decodable {
    let SearchResult: [PlexWireMatch]?
}

private struct PlexWireMatch: Decodable {
    let guid:  String
    let name:  String
    let year:  Int?
    let score: String?
}

// /library/metadata/{ratingKey}/posters — available poster art

private struct PlexPostersResponse: Decodable {
    let MediaContainer: PlexPostersContainer
}

private struct PlexPostersContainer: Decodable {
    let Metadata: [PlexWirePoster]?   // Plex returns posters under "Metadata", not "Photo"
}

private struct PlexWirePoster: Decodable {
    let key:      String
    let thumb:    String?   // pre-sized thumbnail URL from Plex's photo proxy
    let selected: Bool?
    let provider: String?
}

// plex.tv/api/v2/resources — server discovery when no local URL is configured
private struct PlexResource: Decodable {
    let name:             String
    let clientIdentifier: String?      // server's machine identifier as known to plex.tv
    let provides:         String       // "server" is the one we want
    let connections:      [PlexConnection]
}

private struct PlexConnection: Decodable {
    let uri:   String
    let local: Bool
    let relay: Bool
}

// MARK: - PlexClient

@MainActor
final class PlexClient: ObservableObject {
    @Published var recentlyAdded:      [PlexRecentItem] = []
    @Published var serverName:         String? = nil
    @Published var machineIdentifier:  String? = nil
    @Published var isConnected = false
    @Published var error: String?

    // Resolved server URL cached after discovery — avoids repeating the resources call
    private var resolvedServerURL: String?

    // Disk cache for recently added — survives app restarts so UI is never blank on launch
    private static let cacheKey       = "PlexRecentlyAddedCacheV3"
    // Persisted resolved server URL — skips plex.tv discovery on cold launches
    private static let serverURLKey   = "PlexResolvedServerURL"
    private static let serverNameKey  = "PlexServerName"

    // Every write to recentlyAdded goes through here.
    // Specials (seasonNumber == 0) and show-level stale items (seasonNumber == nil)
    // are dropped regardless of which code path triggered the update.
    private func setRecentlyAdded(_ items: [PlexRecentItem]) {
        recentlyAdded = items.filter { item in
            guard item.mediaType == .tv else { return true }
            return (item.seasonNumber ?? 0) > 0
        }
    }

    private func loadCached() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let items = try? JSONDecoder().decode([PlexRecentItem].self, from: data) else { return }
        setRecentlyAdded(items)
        // Re-save if the filter stripped anything so future launches start clean
        if recentlyAdded.count != items.count { saveCache(recentlyAdded) }
    }

    private func saveCache(_ items: [PlexRecentItem]) {
        // Always filter before writing so stale Specials can never enter the cache
        let clean = items.filter { item in
            guard item.mediaType == .tv else { return true }
            return (item.seasonNumber ?? 0) > 0
        }
        guard let data = try? JSONEncoder().encode(clean) else { return }
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    private var cachedConfig = ServiceConfig()
    var isTokenConfigured: Bool { !cachedConfig.apiKey.isEmpty }
    private var pollTask:  Task<Void, Never>?

    // MARK: - Plex WebSocket event stream
    private var wsLoopTask:      Task<Void, Never>?
    private var wsConnectedURL:  String?   // server URL currently connected to

    init() {
        loadCached()
        // Preload persisted server URL and name so cold launches skip the plex.tv discovery call
        resolvedServerURL = UserDefaults.standard.string(forKey: Self.serverURLKey)
        serverName        = UserDefaults.standard.string(forKey: Self.serverNameKey)
    }

    // MARK: - Lifecycle

    /// One-shot fetch — called on launch and settings save.
    func startPolling() {
        cachedConfig = CredentialStore.shared.load(.plex)
        // resolvedServerURL is intentionally NOT reset — persisted URL survives cold launches.
        // If it becomes stale (server changed), poll() will clear it and re-discover next time.
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    /// One-shot fetch — called on manual pull-to-refresh.
    func refresh() {
        cachedConfig = CredentialStore.shared.load(.plex)
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    func stopPolling() {
        pollTask?.cancel()
        stopEventStream()
    }

    private func startEventStream(serverURL: String, token: String) {
        guard wsConnectedURL != serverURL else { return }   // already on this server
        stopEventStream()
        wsConnectedURL = serverURL

        let wsBase = serverURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://",  with: "ws://")
        guard let url = URL(string: "\(wsBase)/:/websockets/notifications?X-Plex-Token=\(token)") else { return }

        wsLoopTask = Task { [weak self] in await self?.runEventStream(url: url, serverURL: serverURL) }
    }

    private func stopEventStream() {
        wsLoopTask?.cancel()
        wsLoopTask     = nil
        wsConnectedURL = nil
    }

    /// Persistent receive loop — reconnects with exponential backoff on failure.
    private func runEventStream(url: URL, serverURL: String) async {
        var backoff: UInt64 = 5_000_000_000   // 5 s initial
        while !Task.isCancelled && wsConnectedURL == serverURL {
            let task = URLSession.shared.webSocketTask(with: url)
            task.resume()
            // Inner receive loop
            receiveLoop: while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    if case .string(let text) = message { handlePlexEvent(text) }
                    backoff = 5_000_000_000   // reset on successful message
                } catch {
                    task.cancel(with: .goingAway, reason: nil)
                    break receiveLoop
                }
            }
            guard !Task.isCancelled else { break }
            try? await Task.sleep(nanoseconds: backoff)
            backoff = min(backoff * 2, 120_000_000_000)   // cap at 2 min
        }
    }

    private func handlePlexEvent(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let container = json["NotificationContainer"] as? [String: Any],
              (container["type"] as? String) == "timeline",
              let entries = container["TimelineEntry"] as? [[String: Any]] else { return }

        let hasNewItem = entries.contains { entry in
            (entry["identifier"] as? String) == "com.plexapp.plugins.library"
            && (entry["state"] as? Int) == 5
        }
        guard hasNewItem else { return }

        // Capture known IDs before poll so we can diff after
        let knownIDs = Set(recentlyAdded.map(\.id))

        Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .seconds(3))
            await self.poll()
            // Notify for each item that wasn't in the list before
            for item in self.recentlyAdded where !knownIDs.contains(item.id) {
                let mediaType = item.mediaType == .movie ? "Movie" : "TV Show"
                NotificationManager.shared.schedulePlexItemAdded(
                    title: item.title, mediaType: mediaType)
            }
        }
    }

    func clearCache() {
        UserDefaults.standard.removeObject(forKey: Self.cacheKey)
        UserDefaults.standard.removeObject(forKey: Self.serverURLKey)
        resolvedServerURL = nil
        recentlyAdded = []
    }

    // MARK: - Poll

    private func poll() async {
        let cfg = cachedConfig
        guard cfg.enabled, !cfg.apiKey.isEmpty else {
            isConnected = false; return
        }
        do {
            let serverURL = try await resolveServerURL(cfg)
            // Fetch machineIdentifier from /identity on first successful connection
            if machineIdentifier == nil {
                if let mid = try? await fetchMachineIdentifier(serverURL: serverURL, token: cfg.apiKey) {
                    machineIdentifier = mid
                }
            }
            let items = try await fetchRecentlyAdded(serverURL: serverURL, token: cfg.apiKey)
            setRecentlyAdded(items)
            saveCache(recentlyAdded)
            isConnected = true
            error = nil
            startEventStream(serverURL: serverURL, token: cfg.apiKey)
        } catch {
            // Clear the cached server URL — it may have become stale (server moved, token changed).
            // Next startPolling() will re-discover from plex.tv rather than retrying a dead URL.
            resolvedServerURL = nil
            UserDefaults.standard.removeObject(forKey: Self.serverURLKey)
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
        let needsDiscovery = cfg.baseURL.isEmpty
            || cfg.baseURL.contains("plex.tv")
            || cfg.baseURL == "https://app.plex.tv"

        if !needsDiscovery {
            // User has a direct URL — always use it, no caching needed
            resolvedServerURL = cfg.baseURL
            return cfg.baseURL
        }

        // Use in-memory cache (pre-loaded from UserDefaults in init, or set by a prior discovery)
        if let cached = resolvedServerURL { return cached }

        let url = try await discoverServerURL(token: cfg.apiKey)
        // Persist so subsequent cold launches skip this plex.tv round-trip
        UserDefaults.standard.set(url, forKey: Self.serverURLKey)
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
        serverName = server.name
        UserDefaults.standard.set(server.name, forKey: Self.serverNameKey)
        // clientIdentifier is the canonical machineIdentifier plex.tv uses — set it now
        // so deep links work even before poll() fetches /identity.
        if let cid = server.clientIdentifier { machineIdentifier = cid }

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
        if let mid = sectionsResp.MediaContainer.machineIdentifier { machineIdentifier = mid }
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
        // type=4 forces episode-level results for show libraries so parentIndex is always
        // present and our Specials filter (parentIndex == 0) works reliably across all
        // Plex versions. Without this, Plex may return show- or season-level items that
        // have no parentIndex and slip through the filter.
        let typeParam = section.type == "show" ? "4" : "1"
        comp.queryItems = [
            URLQueryItem(name: "X-Plex-Token",           value: token),
            URLQueryItem(name: "X-Plex-Container-Size",  value: "24"),
            URLQueryItem(name: "X-Plex-Container-Start", value: "0"),
            URLQueryItem(name: "type",                   value: typeParam),
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
                id: item.ratingKey, deleteRatingKey: item.ratingKey,
                title: item.title, subtitle: nil,
                mediaType: .movie, year: item.year,
                posterURL: posterURL, backdropURL: backdropURL,
                addedAt: addedAt, isWatched: (item.viewCount ?? 0) > 0,
                summary: item.summary, seasonNumber: nil,
                videoResolution: media?.videoResolution,
                videoCodec: media?.videoCodec,
                audioCodec: media?.audioCodec,
                bitrate: media?.bitrate
            )

        case "episode":
            let seasonNum = item.parentIndex ?? 0
            let parentTitleLower = (item.parentTitle ?? "").lowercased()
            let specialKeywords = ["special", "extra", "ova", "bonus", "behind",
                                   "featurette", "short", "trailer", "deleted", "interview",
                                   "blooper", "clip", "recap", "preview", "promo"]
            let isSpecialSeason = seasonNum == 0
                || specialKeywords.contains(where: { parentTitleLower.contains($0) })
            guard !isSpecialSeason else { return nil }
            let id          = item.grandparentRatingKey ?? item.ratingKey
            let thumbPath   = item.grandparentThumb ?? item.thumb
            let posterURL   = thumbPath.map { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let backdropURL = item.art.map  { "\(serverURL)\($0)?X-Plex-Token=\(token)" }
            let addedAt     = item.addedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) } ?? Date()
            return PlexRecentItem(
                id: id, deleteRatingKey: item.ratingKey,
                title:    item.grandparentTitle ?? item.title,
                subtitle: nil,
                mediaType: .tv, year: item.grandparentYear ?? item.year,
                posterURL: posterURL, backdropURL: backdropURL,
                addedAt: addedAt, isWatched: (item.viewCount ?? 0) > 0,
                summary: item.summary, seasonNumber: item.parentIndex,
                videoResolution: media?.videoResolution,
                videoCodec: media?.videoCodec,
                audioCodec: media?.audioCodec,
                bitrate: media?.bitrate
            )

        default:
            return nil
        }
    }

    // MARK: - Machine identifier

    private func fetchMachineIdentifier(serverURL: String, token: String) async throws -> String {
        guard var comp = URLComponents(string: "\(serverURL)/identity") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [URLQueryItem(name: "X-Plex-Token", value: token)]
        guard let url = comp.url else { throw NetworkError.badURL }
        let response: PlexResponse = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
        guard let mid = response.MediaContainer.machineIdentifier else {
            throw NetworkError.badResponse(0)
        }
        return mid
    }

    // MARK: - Metadata actions

    /// Tells Plex to refresh metadata for the given ratingKey (force-refresh from agent).
    func refreshMetadata(ratingKey: String) async throws {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/refresh") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [
            URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey),
            URLQueryItem(name: "force",         value: "1"),
        ]
        guard let url = comp.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Plex-Token")
        _ = try await URLSession.shared.data(for: req)
    }

    /// Returns candidate matches from Plex's metadata agents for the Fix Match flow.
    func fetchMatches(ratingKey: String, title: String, year: Int?) async throws -> [PlexMatchCandidate] {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/matches") else {
            throw NetworkError.badURL
        }
        var items: [URLQueryItem] = [
            URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey),
            URLQueryItem(name: "title",         value: title),
            URLQueryItem(name: "language",      value: "en"),
        ]
        if let year { items.append(URLQueryItem(name: "year", value: String(year))) }
        comp.queryItems = items
        guard let url = comp.url else { throw NetworkError.badURL }
        let response: PlexMatchesResponse = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
        return (response.MediaContainer.SearchResult ?? []).map {
            PlexMatchCandidate(guid: $0.guid, name: $0.name, year: $0.year,
                               score: Int($0.score ?? "") ?? 0)
        }
    }

    /// Applies a selected match and triggers a metadata refresh.
    func applyMatch(ratingKey: String, guid: String, name: String, year: Int?) async throws {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/match") else {
            throw NetworkError.badURL
        }
        var items: [URLQueryItem] = [
            URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey),
            URLQueryItem(name: "guid",          value: guid),
            URLQueryItem(name: "name",          value: name),
            URLQueryItem(name: "language",      value: "en"),
        ]
        if let year { items.append(URLQueryItem(name: "year", value: String(year))) }
        comp.queryItems = items
        guard let url = comp.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Plex-Token")
        _ = try await URLSession.shared.data(for: req)
        // Always refresh after applying a match so metadata reflects the new agent selection
        try await refreshMetadata(ratingKey: ratingKey)
    }

    /// Returns all available poster images for the given ratingKey.
    func fetchPosters(ratingKey: String) async throws -> [PlexPosterItem] {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/posters") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey)]
        guard let url = comp.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw NetworkError.badResponse(http.statusCode)
        }

        do {
            let parsed = try JSONDecoder().decode(PlexPostersResponse.self, from: data)
            let items = parsed.MediaContainer.Metadata ?? []
            return items.map { photo in
                // Use thumb (pre-sized by Plex's photo proxy) for display; fall back to key.
                // Local paths need serverURL + token; external URLs are self-contained.
                let rawThumb = photo.thumb ?? photo.key
                let thumbURL = rawThumb.hasPrefix("http")
                    ? rawThumb
                    : "\(serverURL)\(rawThumb)?X-Plex-Token=\(cfg.apiKey)"
                return PlexPosterItem(key: photo.key, selected: photo.selected ?? false, thumbURL: thumbURL)
            }
        } catch {
            print("[Plex Posters] Decode error: \(error)")
            throw NetworkError.decodingFailed(error)
        }
    }

    /// Fetches file size, play count, last watched date and library section for a single item.
    func fetchItemDetails(ratingKey: String) async throws -> PlexItemDetails {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey)]
        guard let url = comp.url else { throw NetworkError.badURL }
        let response: PlexResponse = try await NetworkClient.shared.fetch(url, headers: plexHeaders)
        guard let meta = response.MediaContainer.Metadata?.first else {
            throw NetworkError.badResponse(404)
        }
        let fileSize = meta.Media?.first?.Part?.first?.size
        let lastViewed = meta.lastViewedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) }
        return PlexItemDetails(
            fileSize:     fileSize,
            playCount:    meta.viewCount ?? 0,
            lastViewedAt: lastViewed,
            sectionTitle: meta.librarySectionTitle
        )
    }

    /// Fetches available background art for the given ratingKey (/arts).
    func fetchArts(ratingKey: String) async throws -> [PlexPosterItem] {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/arts") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey)]
        guard let url = comp.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw NetworkError.badResponse(http.statusCode)
        }

        let parsed = try JSONDecoder().decode(PlexPostersResponse.self, from: data)
        let items = parsed.MediaContainer.Metadata ?? []
        return items.map { photo in
            let rawThumb = photo.thumb ?? photo.key
            let thumbURL = rawThumb.hasPrefix("http")
                ? rawThumb
                : "\(serverURL)\(rawThumb)?X-Plex-Token=\(cfg.apiKey)"
            return PlexPosterItem(key: photo.key, selected: photo.selected ?? false, thumbURL: thumbURL)
        }
    }

    /// Sets the active background art for the given ratingKey.
    func setArt(ratingKey: String, artKey: String) async throws {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/art") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [
            URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey),
            URLQueryItem(name: "url",           value: artKey),
        ]
        guard let url = comp.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Plex-Token")
        _ = try await URLSession.shared.data(for: req)
    }

    /// Sets the active poster for the given ratingKey.
    func setPoster(ratingKey: String, posterKey: String) async throws {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var comp = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)/poster") else {
            throw NetworkError.badURL
        }
        comp.queryItems = [
            URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey),
            URLQueryItem(name: "url",           value: posterKey),
        ]
        guard let url = comp.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        for (k, v) in plexHeaders { req.setValue(v, forHTTPHeaderField: k) }
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Plex-Token")
        _ = try await URLSession.shared.data(for: req)
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

    // MARK: - Delete media

    func deleteMedia(ratingKey: String) async throws {
        let cfg = cachedConfig
        let serverURL = try await resolveServerURL(cfg)
        guard var components = URLComponents(string: "\(serverURL)/library/metadata/\(ratingKey)") else {
            throw NetworkError.badURL
        }
        components.queryItems = [URLQueryItem(name: "X-Plex-Token", value: cfg.apiKey)]
        guard let url = components.url else { throw NetworkError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        for (k, v) in plexHeaders { request.setValue(v, forHTTPHeaderField: k) }
        request.setValue(cfg.apiKey, forHTTPHeaderField: "X-Plex-Token")

        print("[Plex Delete] ratingKey=\(ratingKey) url=\(url)")
        let (data, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        if let body = String(data: data, encoding: .utf8), !body.isEmpty {
            print("[Plex Delete] status=\(statusCode) body=\(body)")
        } else {
            print("[Plex Delete] status=\(statusCode) (empty body)")
        }
        if statusCode == 400 {
            throw NSError(domain: "PlexClient", code: 400,
                userInfo: [NSLocalizedDescriptionKey:
                    "Plex rejected the delete request (400). Check that \"Allow media deletion\" is enabled in Plex → Settings → Library."])
        }
        guard statusCode == 200 else {
            throw NetworkError.badResponse(statusCode)
        }

        // Optimistically remove from local list and refresh
        recentlyAdded.removeAll { $0.deleteRatingKey == ratingKey || $0.id == ratingKey }
        saveCache(recentlyAdded)
        Task { await poll() }
    }

    // MARK: - Test connection

    func testConnection() async -> ConnectionResult {
        await testConnection(with: cachedConfig)
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
