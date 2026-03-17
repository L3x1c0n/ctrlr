import Foundation

// MARK: - Wire models (private)

private struct SonarrCalendarItem: Decodable {
    let id:            Int
    let seriesId:      Int
    let title:         String
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

    private var config: ServiceConfig { CredentialStore.shared.load(.sonarr) }
    private var pollTask: Task<Void, Never>?
    private var session = URLSession(configuration: .default)

    // One-shot fetch — called on launch, after settings save, and on ntfy import events.
    // No polling loop: Sonarr data changes only when something is grabbed/imported.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in await self?.poll() }
    }

    func stopPolling() { pollTask?.cancel() }

    private func poll() async {
        let cfg = config
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
        let today = Calendar.current.startOfDay(for: Date())
        guard let endDate = Calendar.current.date(byAdding: .day, value: 14, to: today) else {
            return []
        }

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withFullDate]
        let startStr = isoFormatter.string(from: today)
        let endStr   = isoFormatter.string(from: endDate)

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
            mediaType:   .tv,
            airDate:     airDate,
            releaseType: "Airing",
            hasFile:     item.hasFile,
            source:      .sonarr,
            posterURL:   postersByTitle[item.series.title.lowercased()],
            posterData:  nil
        )
    }

    // MARK: - Queue fetch

    private func fetchQueue(_ cfg: ServiceConfig) async throws -> [EnrichedDownload] {
        guard var components = URLComponents(string: "\(cfg.baseURL)/api/v3/queue") else {
            throw NetworkError.badURL
        }
        components.queryItems = [URLQueryItem(name: "pageSize", value: "100")]
        guard let url = components.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")

        let (data, _) = try await session.data(for: req)
        let response  = try JSONDecoder().decode(SonarrQueueResponse.self, from: data)

        // Expand poster map with queue items (covers series outside the 14-day calendar window)
        for item in response.records {
            if let series = item.series, let sid = item.seriesId {
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
            let poster: String?
            if let sid = item.seriesId {
                poster = "\(cfg.baseURL)/api/v3/mediacover/\(sid)/poster.jpg"
            } else {
                poster = item.series?.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? item.series?.images.first?.remoteUrl
            }
            let headers = ["X-Api-Key": cfg.apiKey]
            return EnrichedDownload(
                hash:          item.downloadId?.lowercased() ?? "",
                title:         item.series?.title ?? item.title,
                subtitle:      sub,
                posterURL:     poster,
                posterHeaders: poster?.hasPrefix(cfg.baseURL) == true ? headers : [:],
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

        // Poster map from full library
        var map: [String: String] = [:]
        for show in series {
            let rawURL = show.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? show.images.first?.remoteUrl
            if let url = rawURL, !url.isEmpty {
                map[show.title.lowercased()] =
                    "\(cfg.baseURL)/api/v3/mediacover/\(show.id)/poster.jpg"
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
        ["X-Api-Key": config.apiKey]
    }

    // MARK: - Test connection (uses keychain config)

    func testConnection() async -> ConnectionResult {
        return await testConnection(with: config)
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
