import Foundation

// MARK: - Wire models (private)

private struct OverseerrRequestsResponse: Decodable {
    let results: [OverseerrWireRequest]
}

private struct OverseerrWireRequest: Decodable {
    let id:          Int
    let status:      Int
    let type:        String
    let media:       OverseerrWireMedia
    let requestedBy: OverseerrWireUser?
    let createdAt:   String?
}

private struct OverseerrWireMedia: Decodable {
    let tmdbId:     Int?
    let posterPath: String?
    let status:     Int?    // 1=unknown 2=pending 3=processing 4=partial 5=available
}

private struct OverseerrWireUser: Decodable {
    let displayName:  String?
    let plexUsername: String?
}

private struct OverseerrMediaDetail: Decodable {
    let title:           String?   // movies
    let name:            String?   // TV
    let posterPath:      String?
    let numberOfSeasons: Int?      // TV only
    let mediaInfo:       OverseerrDetailMediaInfo?
}

private struct OverseerrDetailMediaInfo: Decodable {
    let requests: [OverseerrDetailRequest]?
}

private struct OverseerrDetailRequest: Decodable {
    let id: Int
}

// Rich detail wire models
private struct OverseerrRichMovieDetail: Decodable {
    let title:                String?
    let overview:             String?
    let posterPath:           String?
    let backdropPath:         String?
    let runtime:              Int?
    let voteAverage:          Double?
    let releaseDate:          String?
    let genres:               [OverseerrWireGenre]?
    let credits:              OverseerrWireCredits?
    let productionCompanies:  [OverseerrWireStudio]?
    let releases:             OverseerrWireReleaseGroups?
}

private struct OverseerrRichTVDetail: Decodable {
    let name:             String?
    let overview:         String?
    let posterPath:       String?
    let backdropPath:     String?
    let episodeRunTime:   [Int]?
    let voteAverage:      Double?
    let firstAirDate:     String?
    let genres:           [OverseerrWireGenre]?
    let credits:          OverseerrWireCredits?
    let networks:         [OverseerrWireStudio]?
    let createdBy:        [OverseerrWireCreator]?
    let contentRatings:   OverseerrWireContentRatings?
    let numberOfSeasons:  Int?
    let numberOfEpisodes: Int?
}

private struct OverseerrWireGenre: Decodable {
    let name: String
}

private struct OverseerrWireCredits: Decodable {
    let cast: [OverseerrWireCastMember]?
    let crew: [OverseerrWireCrewMember]?
}

private struct OverseerrWireCastMember: Decodable {
    let id:          Int
    let name:        String
    let character:   String?
    let profilePath: String?
}

private struct OverseerrWireCrewMember: Decodable {
    let name:       String
    let job:        String?
    let department: String?
}

private struct OverseerrWireStudio: Decodable {
    let name: String
}

private struct OverseerrWireCreator: Decodable {
    let name: String
}

private struct OverseerrWireReleaseGroups: Decodable {
    let results: [OverseerrWireReleaseGroup]?
}

private struct OverseerrWireReleaseGroup: Decodable {
    let iso31661:        String?
    let releaseDates:    [OverseerrWireReleaseDateEntry]?

    private enum CodingKeys: String, CodingKey {
        case iso31661 = "iso_3166_1"
        case releaseDates
    }
}

private struct OverseerrWireReleaseDateEntry: Decodable {
    let certification: String?
}

private struct OverseerrWireContentRatings: Decodable {
    let results: [OverseerrWireContentRating]?
}

private struct OverseerrWireContentRating: Decodable {
    let iso31661: String?
    let rating:   String?

    private enum CodingKeys: String, CodingKey {
        case iso31661 = "iso_3166_1"
        case rating
    }
}

private struct OverseerrSearchResponse: Decodable {
    let results: [OverseerrSearchWireResult]
}

private struct OverseerrSearchWireResult: Decodable {
    let id:              Int
    let mediaType:       String
    let title:           String?
    let name:            String?
    let posterPath:      String?
    let releaseDate:     String?
    let firstAirDate:    String?
    let overview:        String?
    let mediaInfo:       OverseerrSearchMediaInfo?
    let numberOfSeasons: Int?
}

private struct OverseerrSearchMediaInfo: Decodable {
    let status:   Int?
    let requests: [OverseerrSearchRequestRef]?
}

private struct OverseerrSearchRequestRef: Decodable {
    let id: Int
}

private struct OverseerrRequestBody: Encodable {
    let mediaType:  String
    let mediaId:    Int
    let seasons:    [Int]?
    let serverId:   Int?
    let profileId:  Int?
    let rootFolder: String?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(mediaType,            forKey: .mediaType)
        try c.encode(mediaId,              forKey: .mediaId)
        try c.encodeIfPresent(seasons,     forKey: .seasons)
        try c.encodeIfPresent(serverId,    forKey: .serverId)
        try c.encodeIfPresent(profileId,   forKey: .profileId)
        try c.encodeIfPresent(rootFolder,  forKey: .rootFolder)
    }

    private enum CodingKeys: String, CodingKey {
        case mediaType, mediaId, seasons, serverId, profileId, rootFolder
    }
}

// Service API wire models
private struct OverseerrWireServer: Decodable {
    let id:        Int
    let name:      String
    let isDefault: Bool?
}

private struct OverseerrWireServiceDetail: Decodable {
    let profiles:    [OverseerrWireProfile]
    let rootFolders: [OverseerrWireRootFolder]
}

private struct OverseerrWireProfile: Decodable {
    let id:   Int
    let name: String
}

private struct OverseerrWireRootFolder: Decodable {
    let id:   Int
    let path: String
}

// MARK: - OverseerrClient

@MainActor
final class OverseerrClient: ObservableObject {
    @Published var requests:    [OverseerrRequest] = []
    @Published var isConnected: Bool = false
    @Published var error:       String?

    private var config: ServiceConfig { CredentialStore.shared.load(.overseerr) }
    private var pollTask: Task<Void, Never>?
    private let session = URLSession(configuration: .default)

    // Persisted media detail cache — survives app launches, eliminating per-card fetches
    private struct CachedMediaDetail: Codable {
        let title:      String?
        let posterPath: String?
    }
    private var mediaCache: [Int: CachedMediaDetail] = [:]

    private static let cacheKey:      String         = "cache_overseerr_requests"
    private static let mediaCacheKey:  String         = "cache_overseerr_media_details"
    private static let cacheDateKey:   String         = "cache_overseerr_requests_date"
    private static let cacheTTL:       TimeInterval   = 5 * 60   // 5 minutes

    init() {
        let ud = UserDefaults.standard
        if let d = ud.data(forKey: Self.cacheKey),
           let v = try? JSONDecoder().decode([OverseerrRequest].self, from: d) {
            requests = v
        }
        // Restore persisted media details so titles are available immediately on launch
        if let d = ud.data(forKey: Self.mediaCacheKey),
           let v = try? JSONDecoder().decode([Int: CachedMediaDetail].self, from: d) {
            mediaCache = v
        }
    }

    // force: true bypasses TTL — used by pull-to-refresh
    func startPolling(force: Bool = false) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll(force: force) }
    }

    func stopPolling() { pollTask?.cancel() }

    private func poll(force: Bool = false) async {
        let cfg = config
        guard cfg.enabled, !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else {
            isConnected = false; return
        }

        // Serve cached data if fresh enough and not an explicit refresh
        if !force,
           let date = UserDefaults.standard.object(forKey: Self.cacheDateKey) as? Date,
           Date().timeIntervalSince(date) < Self.cacheTTL {
            isConnected = true
            return
        }

        do {
            let fetched = try await fetchRequests(cfg)
            requests    = fetched
            isConnected = true
            error       = nil
            let ud = UserDefaults.standard
            if let d = try? JSONEncoder().encode(fetched) {
                ud.set(d,      forKey: Self.cacheKey)
                ud.set(Date(), forKey: Self.cacheDateKey)
            }
        } catch {
            isConnected = false
            self.error  = error.localizedDescription
        }
    }

    // MARK: - Request list

    private func fetchRequests(_ cfg: ServiceConfig) async throws -> [OverseerrRequest] {
        guard var comps = URLComponents(string: "\(cfg.baseURL)/api/v1/request") else {
            throw NetworkError.badURL
        }
        comps.queryItems = [
            URLQueryItem(name: "take",   value: "20"),
            URLQueryItem(name: "skip",   value: "0"),
            URLQueryItem(name: "sort",   value: "added"),
            URLQueryItem(name: "filter", value: "all"),
        ]
        guard let url = comps.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        let (data, _) = try await session.data(for: req)
        let response  = try JSONDecoder().decode(OverseerrRequestsResponse.self, from: data)
        return response.results.map { mapRequest($0) }
    }

    private func mapRequest(_ r: OverseerrWireRequest) -> OverseerrRequest {
        let iso  = ISO8601DateFormatter(); iso.formatOptions  = [.withInternetDateTime, .withFractionalSeconds]
        let iso2 = ISO8601DateFormatter(); iso2.formatOptions = [.withInternetDateTime]
        var date: Date?
        if let s = r.createdAt { date = iso.date(from: s) ?? iso2.date(from: s) }
        let requester = r.requestedBy?.displayName ?? r.requestedBy?.plexUsername ?? "Unknown"
        return OverseerrRequest(
            id:          r.id,
            status:      OverseerrRequestStatus(rawValue: r.status) ?? .unknown,
            mediaType:   r.type,
            tmdbId:      r.media.tmdbId,
            requestedBy: requester,
            createdAt:   date,
            title:       nil,
            posterPath:  r.media.posterPath,
            mediaStatus: r.media.status
        )
    }

    // MARK: - Media detail (called lazily per card)

    func fetchMediaDetail(tmdbId: Int, mediaType: String) async -> (title: String?, posterPath: String?) {
        if let cached = mediaCache[tmdbId] { return (cached.title, cached.posterPath) }
        let cfg = config
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else { return (nil, nil) }
        let endpoint = mediaType == "tv" ? "tv" : "movie"
        guard let url = URL(string: "\(cfg.baseURL)/api/v1/\(endpoint)/\(tmdbId)") else { return (nil, nil) }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req),
              let wire       = try? JSONDecoder().decode(OverseerrMediaDetail.self, from: data)
        else { return (nil, nil) }
        let entry = CachedMediaDetail(title: wire.title ?? wire.name, posterPath: wire.posterPath)
        // Only cache if we got a posterPath — a null posterPath may mean Overseerr hasn't
        // indexed the entry yet, so we want to retry on next launch rather than lock in nil.
        if entry.posterPath != nil {
            mediaCache[tmdbId] = entry
            if let d = try? JSONEncoder().encode(mediaCache) {
                UserDefaults.standard.set(d, forKey: Self.mediaCacheKey)
            }
        } else if mediaCache[tmdbId] == nil {
            // Cache the title only so we don't re-fetch title on every load
            mediaCache[tmdbId] = CachedMediaDetail(title: entry.title, posterPath: nil)
        }
        return (entry.title, entry.posterPath)
    }

    /// Fetch the Overseerr-internal request ID for an already-requested title.
    /// Hits the same movie/tv detail endpoint and reads mediaInfo.requests[0].id.
    func fetchRequestId(tmdbId: Int, mediaType: String) async -> Int? {
        let cfg = config
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else { return nil }
        let endpoint = mediaType == "tv" ? "tv" : "movie"
        guard let url = URL(string: "\(cfg.baseURL)/api/v1/\(endpoint)/\(tmdbId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req),
              let wire       = try? JSONDecoder().decode(OverseerrMediaDetail.self, from: data)
        else { return nil }
        return wire.mediaInfo?.requests?.first?.id
    }

    // MARK: - Rich media info

    func fetchMediaInfo(tmdbId: Int, mediaType: String) async -> OverseerrMediaInfo? {
        let cfg = config
        let base = cfg.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, !cfg.apiKey.isEmpty else { return nil }
        let endpoint = mediaType == "tv" ? "tv" : "movie"
        guard let url = URL(string: "\(base)/api/v1/\(endpoint)/\(tmdbId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req) else { return nil }

        if mediaType == "tv" {
            guard let d = try? JSONDecoder().decode(OverseerrRichTVDetail.self, from: data) else { return nil }
            let cert = d.contentRatings?.results?
                .first(where: { $0.iso31661 == "US" })?.rating
                ?? d.contentRatings?.results?.first?.rating
            let directors = d.createdBy?.map(\.name) ?? []
            let studios   = d.networks?.map(\.name) ?? []
            let cast      = (d.credits?.cast ?? []).prefix(8).map {
                OverseerrCastMember(id: $0.id, name: $0.name, character: $0.character, profilePath: $0.profilePath)
            }
            return OverseerrMediaInfo(
                title:            d.name ?? "",
                overview:         d.overview,
                posterPath:       d.posterPath,
                backdropPath:     d.backdropPath,
                voteAverage:      d.voteAverage,
                certification:    cert,
                runtime:          d.episodeRunTime?.first,
                releaseDate:      d.firstAirDate,
                genres:           d.genres?.map(\.name) ?? [],
                cast:             Array(cast),
                directors:        directors,
                studios:          studios,
                numberOfSeasons:  d.numberOfSeasons,
                numberOfEpisodes: d.numberOfEpisodes
            )
        } else {
            guard let d = try? JSONDecoder().decode(OverseerrRichMovieDetail.self, from: data) else { return nil }
            let cert = d.releases?.results?
                .first(where: { $0.iso31661 == "US" })?
                .releaseDates?.first(where: { !($0.certification?.isEmpty ?? true) })?.certification
                ?? d.releases?.results?.compactMap { $0.releaseDates?.first(where: { !($0.certification?.isEmpty ?? true) })?.certification }.first
            let directors = d.credits?.crew?
                .filter { $0.job == "Director" }
                .map(\.name) ?? []
            let studios = d.productionCompanies?.map(\.name) ?? []
            let cast    = (d.credits?.cast ?? []).prefix(8).map {
                OverseerrCastMember(id: $0.id, name: $0.name, character: $0.character, profilePath: $0.profilePath)
            }
            return OverseerrMediaInfo(
                title:            d.title ?? "",
                overview:         d.overview,
                posterPath:       d.posterPath,
                backdropPath:     d.backdropPath,
                voteAverage:      d.voteAverage,
                certification:    cert,
                runtime:          d.runtime,
                releaseDate:      d.releaseDate,
                genres:           d.genres?.map(\.name) ?? [],
                cast:             Array(cast),
                directors:        directors,
                studios:          studios,
                numberOfSeasons:  nil,
                numberOfEpisodes: nil
            )
        }
    }

    private func fetchNumberOfSeasons(tmdbId: Int) async -> Int {
        let cfg = config
        let base = cfg.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, !cfg.apiKey.isEmpty,
              let url = URL(string: "\(base)/api/v1/tv/\(tmdbId)") else { return 0 }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req),
              let detail = try? JSONDecoder().decode(OverseerrMediaDetail.self, from: data)
        else { return 0 }
        return detail.numberOfSeasons ?? 0
    }

    // MARK: - Search

    func search(query: String) async -> [OverseerrSearchResult] {
        let cfg = config
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty,
              var comps = URLComponents(string: "\(cfg.baseURL)/api/v1/search") else { return [] }
        comps.queryItems = [
            URLQueryItem(name: "query",    value: query),
            URLQueryItem(name: "page",     value: "1"),
            URLQueryItem(name: "language", value: "en"),
        ]
        guard let url = comps.url else { return [] }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req),
              let response  = try? JSONDecoder().decode(OverseerrSearchResponse.self, from: data)
        else { return [] }
        return response.results
            .filter { $0.mediaType == "movie" || $0.mediaType == "tv" }
            .map { r in
                OverseerrSearchResult(
                    id:              r.id,
                    mediaType:       r.mediaType,
                    title:           r.title ?? r.name ?? "Unknown",
                    year:            (r.releaseDate ?? r.firstAirDate).map { String($0.prefix(4)) },
                    posterPath:      r.posterPath,
                    overview:        r.overview,
                    mediaStatus:     r.mediaInfo?.status,
                    numberOfSeasons: r.numberOfSeasons,
                    requestId:       r.mediaInfo?.requests?.first?.id
                )
            }
    }

    // MARK: - Submit request

    /// Returns true on success (201 Created or 200 OK).
    /// For TV shows, pass numberOfSeasons from the search result so the correct
    /// seasons array [1, 2, 3, ...] is built. If unknown, a detail fetch is used
    /// as fallback — Overseerr requires at least one season number for TV requests.
    func submitRequest(tmdbId: Int, mediaType: String, numberOfSeasons: Int? = nil,
                       serverId: Int? = nil, profileId: Int? = nil, rootFolder: String? = nil) async -> Bool {
        let cfg = config
        let base = cfg.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, !cfg.apiKey.isEmpty,
              let url = URL(string: "\(base)/api/v1/request") else {
            self.error = "Bad URL: '\(cfg.baseURL)'"
            return false
        }

        // Build seasons array for TV — Overseerr rejects empty or missing seasons
        var seasons: [Int]? = nil
        if mediaType == "tv" {
            if let n = numberOfSeasons, n > 0 {
                seasons = Array(1...n)
            } else {
                // Fallback: fetch TV detail to get season count
                let n = await fetchNumberOfSeasons(tmdbId: tmdbId)
                guard n > 0 else { return false }
                seasons = Array(1...n)
            }
        }

        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = OverseerrRequestBody(mediaType: mediaType, mediaId: tmdbId, seasons: seasons,
                                        serverId: serverId, profileId: profileId, rootFolder: rootFolder)
        guard let bodyData = try? JSONEncoder().encode(body) else { return false }
        req.httpBody = bodyData
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                error = "No HTTP response"
                return false
            }
            if (200...299).contains(http.statusCode) {
                startPolling()
                return true
            }
            error = "HTTP \(http.statusCode): \(String(data: data, encoding: .utf8) ?? "")"
            return false
        } catch {
            self.error = "Request failed: \(error.localizedDescription)"
            return false
        }
    }

    // MARK: - Service options (quality profiles + root folders)

    func fetchServiceOptions(mediaType: String) async -> OverseerrServiceOptions? {
        let cfg  = config
        let base = cfg.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, !cfg.apiKey.isEmpty else { return nil }
        let service = mediaType == "tv" ? "sonarr" : "radarr"

        guard let serversURL = URL(string: "\(base)/api/v1/service/\(service)") else { return nil }
        var serversReq = URLRequest(url: serversURL, timeoutInterval: 10)
        serversReq.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (serversData, _) = try? await session.data(for: serversReq),
              let servers = try? JSONDecoder().decode([OverseerrWireServer].self, from: serversData),
              let server  = servers.first(where: { $0.isDefault == true }) ?? servers.first
        else { return nil }

        guard let detailURL = URL(string: "\(base)/api/v1/service/\(service)/\(server.id)") else { return nil }
        var detailReq = URLRequest(url: detailURL, timeoutInterval: 10)
        detailReq.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (detailData, _) = try? await session.data(for: detailReq),
              let detail = try? JSONDecoder().decode(OverseerrWireServiceDetail.self, from: detailData)
        else { return nil }

        return OverseerrServiceOptions(
            serverId:    server.id,
            profiles:    detail.profiles.map    { OverseerrQualityProfile(id: $0.id, name: $0.name) },
            rootFolders: detail.rootFolders.map { OverseerrRootFolder(id: $0.id, path: $0.path) }
        )
    }

    // MARK: - Delete request

    func deleteRequest(id: Int) async -> Bool {
        let cfg  = config
        let base = cfg.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, !cfg.apiKey.isEmpty,
              let url = URL(string: "\(base)/api/v1/request/\(id)") else { return false }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = "DELETE"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (_, response) = try? await session.data(for: req),
              let http = response as? HTTPURLResponse else { return false }
        if (200...299).contains(http.statusCode) {
            startPolling()
            return true
        }
        return false
    }

    // MARK: - Test connection

    func testConnection(with cfg: ServiceConfig) async -> ConnectionResult {
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else {
            return .failure("URL and API key required")
        }
        guard let url = URL(string: "\(cfg.baseURL)/api/v1/auth/me") else {
            return .failure("Invalid URL")
        }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        do {
            let (_, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else { return .failure("No response") }
            if http.statusCode == 200 { return .success("Connected") }
            if http.statusCode == 401 { return .failure("Invalid API key") }
            return .failure("HTTP \(http.statusCode)")
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}
