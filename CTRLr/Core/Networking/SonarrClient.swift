import Foundation

// MARK: - Wire models (private)

private struct SonarrCalendarItem: Decodable {
    let id:            Int
    let seriesId:      Int
    let title:         String
    let overview:      String?
    let seasonNumber:  Int
    let episodeNumber: Int
    let airDate:       String?
    let airDateUtc:    String?
    let series:        SonarrSeries
    let hasFile:       Bool
    let monitored:     Bool
}

private struct SonarrSeries: Decodable {
    let title:  String
    let images: [SonarrImage]
    let tmdbId: Int?
}

private struct SonarrImage: Decodable {
    let coverType: String
    let remoteUrl: String
}

private struct SonarrQueueSeries: Decodable {
    let title:  String
    let images: [SonarrImage]
}

private struct SonarrQueueEpisode: Decodable {
    let seasonNumber:  Int
    let episodeNumber: Int
}

private struct SonarrQueueItem: Decodable {
    let downloadId: String?
    let title:      String
    let seriesId:   Int?
    let series:     SonarrQueueSeries?
    let episode:    SonarrQueueEpisode?
}

private struct SonarrQueueResponse: Decodable {
    let records: [SonarrQueueItem]
}

private struct SonarrSeriesItem: Decodable {
    let id:     Int
    let title:  String
    let tvdbId: Int?
    let images: [SonarrImage]
}

// History endpoint models — used to find recently imported episodes

private struct SonarrHistoryRecord: Decodable {
    let date:   String             // ISO8601 import date
    let series: SonarrHistorySeries?
}

private struct SonarrHistorySeries: Decodable {
    let id:     Int
    let title:  String
    let images: [SonarrImage]
}

private struct SonarrHistoryResponse: Decodable {
    let records: [SonarrHistoryRecord]
}

private struct SonarrSystemStatus: Decodable {
    let version: String
}

// MARK: - SonarrClient

@MainActor
final class SonarrClient: ObservableObject {
    @Published var upcomingEpisodes: [UpcomingItem]    = []
    @Published var downloadQueue:    [EnrichedDownload] = []
    @Published var postersByTitle:   [String: String] = [:]   // lowercased series title → poster URL
    @Published var recentlyAdded:    [RecentItem]     = []    // top 8 most recently added series
    @Published var isConnected = false
    @Published var error: String?

    private var cachedConfig = ServiceConfig()
    private var pollTask: Task<Void, Never>?
    private var session = URLSession(configuration: .default)

    // One-shot fetch — called on launch, after settings save, and on ntfy import events.
    // No polling loop: Sonarr data changes only when something is grabbed/imported.
    func startPolling() {
        cachedConfig = CredentialStore.shared.load(.sonarr)
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    func stopPolling() { pollTask?.cancel() }

    /// Lightweight queue-only refresh — called when a new torrent hash appears in qBittorrent.
    func refreshQueue() async {
        let cfg = cachedConfig
        guard cfg.enabled, !cfg.baseURL.isEmpty else { return }
        if let queue = try? await fetchQueue(cfg) {
            downloadQueue = queue
        }
    }

    private func poll() async {
        let cfg = cachedConfig
        guard cfg.enabled, !cfg.baseURL.isEmpty else {
            isConnected = false; return
        }
        do {
            let items = try await fetchCalendar(cfg)
            upcomingEpisodes = items
            isConnected = true
            error = nil
        } catch {
            isConnected = false
            self.error = error.localizedDescription
        }
        // Queue fetch is non-fatal — errors leave downloadQueue empty
        if let queue = try? await fetchQueue(cfg) {
            downloadQueue = queue
        }
        // Full library poster map — non-fatal, broadens poster coverage beyond 14-day window
        if let libraryPosters = try? await fetchAllSeriesPosters(cfg) {
            postersByTitle.merge(libraryPosters) { existing, _ in existing }
        }
    }

    private func fetchCalendar(_ cfg: ServiceConfig) async throws -> [UpcomingItem] {
        let cal   = Calendar.current
        let today = cal.startOfDay(for: Date())
        guard let startDate = cal.date(byAdding: .day, value: -7, to: today),
              let endDate   = cal.date(byAdding: .day, value: 15, to: today) else {
            return []
        }

        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.locale = Locale(identifier: "en_US_POSIX")
        // No explicit timezone → device local, so the date window matches displayed columns
        let startStr = df.string(from: startDate)
        let endStr   = df.string(from: endDate)

        guard var components = URLComponents(string: "\(cfg.baseURL)/api/v3/calendar") else {
            throw NetworkError.badURL
        }
        components.queryItems = [
            URLQueryItem(name: "start",         value: startStr),
            URLQueryItem(name: "end",           value: endStr),
            URLQueryItem(name: "includeSeries", value: "true")
        ]
        guard let url = components.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")

        let (data, _) = try await session.data(for: req)
        let raw = try JSONDecoder().decode([SonarrCalendarItem].self, from: data)

        // Build poster map from calendar series images (valid TMDB/TVDB remoteUrls)
        var posters: [String: String] = [:]
        for item in raw {
            let rawURL = item.series.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? item.series.images.first?.remoteUrl
            if let url = rawURL, !url.isEmpty {
                posters[item.series.title.lowercased()] = url
            }
        }
        postersByTitle = posters

        return raw.compactMap { mapToUpcomingItem($0) }
    }

    private func mapToUpcomingItem(_ item: SonarrCalendarItem) -> UpcomingItem? {
        // Prefer airDateUtc — it's a real UTC timestamp that converts correctly to
        // the user's local timezone. airDate is the network's local broadcast date
        // (e.g. US Eastern) and would place the episode on the wrong day for users
        // ahead of that timezone.
        let airDate: Date
        if let str = item.airDateUtc {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = iso.date(from: str) {
                airDate = d
            } else {
                let iso2 = ISO8601DateFormatter()
                iso2.formatOptions = [.withInternetDateTime]
                guard let d = iso2.date(from: str) else { return nil }
                airDate = d
            }
        } else if let str = item.airDate {
            // Fallback: bare date string — treat as device-local midnight
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd"
            df.locale = Locale(identifier: "en_US_POSIX")
            guard let d = df.date(from: str) else { return nil }
            airDate = d
        } else {
            return nil
        }

        let s = item.seasonNumber
        let e = item.episodeNumber
        let subtitle = "S\(String(format: "%02d", s))E\(String(format: "%02d", e)) · \(item.title)"

        return UpcomingItem(
            id:          "sonarr-\(item.id)",
            title:       item.series.title,
            subtitle:    subtitle,
            overview:    item.overview,
            mediaType:   .tv,
            airDate:     airDate,
            releaseType: "Airing",
            hasFile:     item.hasFile,
            source:      .sonarr,
            posterURL:   postersByTitle[item.series.title.lowercased()],
            posterData:  nil,
            tmdbId:      item.series.tmdbId
        )
    }

    // MARK: - Queue fetch

    private func fetchQueue(_ cfg: ServiceConfig) async throws -> [EnrichedDownload] {
        guard var components = URLComponents(string: "\(cfg.baseURL)/api/v3/queue") else {
            throw NetworkError.badURL
        }
        components.queryItems = [
            URLQueryItem(name: "pageSize",      value: "100"),
            URLQueryItem(name: "includeSeries", value: "true"),
            URLQueryItem(name: "includeEpisode", value: "true"),
        ]
        guard let url = components.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")

        let (data, _) = try await session.data(for: req)
        let response  = try JSONDecoder().decode(SonarrQueueResponse.self, from: data)

        // Expand poster map — prefer public TMDb/TVDB remoteUrl (no auth, always reachable),
        // fall back to local mediacover URL (needs X-Api-Key but works on LAN).
        let headers = ["X-Api-Key": cfg.apiKey]
        for item in response.records {
            guard let series = item.series else { continue }
            let remoteURL = series.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                         ?? series.images.first?.remoteUrl
            if let remoteURL, !remoteURL.isEmpty {
                postersByTitle[series.title.lowercased()] = remoteURL
            } else if let sid = item.seriesId {
                postersByTitle[series.title.lowercased()] =
                    "\(cfg.baseURL)/api/v3/mediacover/\(sid)/poster.jpg"
            }
        }

        return response.records.map { item in
            let sub: String?
            if let ep = item.episode {
                let s = ep.seasonNumber
                let e = ep.episodeNumber
                sub = "S\(String(format: "%02d", s))E\(String(format: "%02d", e))"
            } else {
                sub = nil
            }
            // Prefer public TMDb/TVDB remoteUrl → falls back to local mediacover (needs header)
            let remoteURL = item.series?.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                         ?? item.series?.images.first?.remoteUrl
            let poster: String?
            let posterHeaders: [String: String]
            if let remoteURL, !remoteURL.isEmpty {
                poster        = remoteURL
                posterHeaders = [:]
            } else if let sid = item.seriesId {
                poster        = "\(cfg.baseURL)/api/v3/mediacover/\(sid)/poster.jpg"
                posterHeaders = headers
            } else {
                poster        = nil
                posterHeaders = [:]
            }
            return EnrichedDownload(
                hash:          item.downloadId?.lowercased() ?? "",
                title:         item.series?.title ?? item.title,
                subtitle:      sub,
                posterURL:     poster,
                posterHeaders: posterHeaders,
                source:        .sonarr
            )
        }
    }

    // MARK: - Full library poster map

    private func fetchAllSeriesPosters(_ cfg: ServiceConfig) async throws -> [String: String] {
        guard let url = URL(string: "\(cfg.baseURL)/api/v3/series") else {
            throw NetworkError.badURL
        }
        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        let (data, _) = try await session.data(for: req)
        let series = try JSONDecoder().decode([SonarrSeriesItem].self, from: data)

        // Poster map from full library — use public TMDb/TVDB remoteUrl (no auth needed)
        var map: [String: String] = [:]
        for show in series {
            let rawURL = show.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? show.images.first?.remoteUrl
            if let url = rawURL, !url.isEmpty {
                map[show.title.lowercased()] = url
            }
        }

        // Recently added from import history — deduplicated by series, top 8
        if let recent = try? await fetchRecentlyImported(cfg, seriesList: series) {
            recentlyAdded = recent
        }

        return map
    }

    private func fetchRecentlyImported(_ cfg: ServiceConfig,
                                       seriesList: [SonarrSeriesItem]) async throws -> [RecentItem] {
        guard var components = URLComponents(string: "\(cfg.baseURL)/api/v3/history") else {
            throw NetworkError.badURL
        }
        // eventType 3 = downloadFolderImported
        components.queryItems = [
            URLQueryItem(name: "pageSize",       value: "50"),
            URLQueryItem(name: "sortKey",        value: "date"),
            URLQueryItem(name: "sortDirection",  value: "descending"),
            URLQueryItem(name: "eventType",      value: "3")
        ]
        guard let url = components.url else { throw NetworkError.badURL }
        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        let (data, _) = try await session.data(for: req)
        let response = try JSONDecoder().decode(SonarrHistoryResponse.self, from: data)

        // Build a seriesId → SonarrSeriesItem map for mediacover URL lookup
        let seriesById = Dictionary(uniqueKeysWithValues: seriesList.map { ($0.id, $0) })

        // Deduplicate by series — keep the most recent import per series
        var seen = Set<Int>()
        var result: [RecentItem] = []
        for record in response.records {
            guard let s = record.series, !seen.contains(s.id) else { continue }
            seen.insert(s.id)
            // Use seriesById for the id we need for mediacover URL
            let sid = seriesById[s.id]?.id ?? s.id
            result.append(RecentItem(id: "sonarr-\(sid)", title: s.title, source: .sonarr))
            if result.count == 8 { break }
        }
        return result
    }

    /// HTTP headers required when fetching Sonarr mediacover poster images.
    func posterHeaders() -> [String: String] {
        ["X-Api-Key": cachedConfig.apiKey]
    }

    // MARK: - Episode search + detail

    func triggerSearch(episodeId: Int) async {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/command") else { return }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = "POST"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let name: String; let episodeIds: [Int] }
        req.httpBody = try? JSONEncoder().encode(Body(name: "EpisodeSearch", episodeIds: [episodeId]))
        _ = try? await session.data(for: req)
    }

    /// Returns TVDB IDs for all series in the Sonarr library.
    func fetchAllTvdbIds() async -> [Int] {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/series") else { return [] }
        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        guard let (data, _) = try? await session.data(for: req),
              let series = try? JSONDecoder().decode([SonarrSeriesItem].self, from: data)
        else { return [] }
        return series.compactMap { $0.tvdbId }
    }

    func fetchReleases(episodeId: Int) async -> [MediaRelease] {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/release?episodeId=\(episodeId)") else { return [] }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        struct WireRelease: Decodable {
            let guid: String; let title: String; let indexer: String
            let size: Int64; let quality: WireQuality; let indexerId: Int
            let seeders: Int?; let leechers: Int?; let approved: Bool; let rejections: [String]?
            let downloadProtocol: String?; let ageHours: Double?
            enum CodingKeys: String, CodingKey {
                case guid, title, indexer, size, quality, indexerId
                case seeders, leechers, approved, rejections, ageHours
                case downloadProtocol = "protocol"
            }
        }
        struct WireQuality: Decodable { let quality: WireQualityName }
        struct WireQualityName: Decodable { let name: String }
        guard let (data, _) = try? await session.data(for: req),
              let releases  = try? JSONDecoder().decode([WireRelease].self, from: data)
        else { return [] }
        return releases.map {
            MediaRelease(guid: $0.guid, title: $0.title, indexer: $0.indexer,
                         size: $0.size, quality: $0.quality.quality.name,
                         indexerId: $0.indexerId, seeders: $0.seeders,
                         leechers: $0.leechers,
                         approved: $0.approved, rejections: $0.rejections ?? [],
                         releaseProtocol: $0.downloadProtocol ?? "",
                         ageHours: $0.ageHours.map { Int($0) })
        }
    }

    func downloadRelease(guid: String, indexerId: Int) async -> Bool {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/release") else { return false }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let guid: String; let indexerId: Int }
        req.httpBody = try? JSONEncoder().encode(Body(guid: guid, indexerId: indexerId))
        guard let (_, response) = try? await session.data(for: req),
              let http = response as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
    }

    func fetchEpisodeMonitored(episodeId: Int) async -> Bool? {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/episode/\(episodeId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        struct Stub: Decodable { let monitored: Bool }
        guard let (data, _) = try? await session.data(for: req),
              let stub = try? JSONDecoder().decode(Stub.self, from: data)
        else { return nil }
        return stub.monitored
    }

    func setEpisodeMonitored(episodeId: Int, monitored: Bool) async {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/episode/monitor") else { return }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = "PUT"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let episodeIds: [Int]; let monitored: Bool }
        req.httpBody = try? JSONEncoder().encode(Body(episodeIds: [episodeId], monitored: monitored))
        _ = try? await session.data(for: req)
    }

    func fetchEpisodeOverview(episodeId: Int) async -> String? {
        let cfg = cachedConfig
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/episode/\(episodeId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        struct EpisodeDetail: Decodable { let overview: String? }
        guard let (data, _) = try? await session.data(for: req),
              let detail = try? JSONDecoder().decode(EpisodeDetail.self, from: data)
        else { return nil }
        return detail.overview
    }

    // MARK: - Test connection (uses keychain config)

    func testConnection() async -> ConnectionResult {
        return await testConnection(with: cachedConfig)
    }

    // MARK: - Test connection (uses provided config)

    func testConnection(with cfg: ServiceConfig) async -> ConnectionResult {
        guard !cfg.baseURL.isEmpty else { return .failure("No URL configured") }
        guard let url = URL(string: "\(cfg.baseURL)/api/v3/system/status") else {
            return .failure("Bad URL")
        }
        do {
            var req = URLRequest(url: url)
            req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
            req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
            let testSession = URLSession(configuration: .default)
            let (data, _) = try await testSession.data(for: req)
            let status = try JSONDecoder().decode(SonarrSystemStatus.self, from: data)
            return .success("Sonarr \(status.version)")
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}
