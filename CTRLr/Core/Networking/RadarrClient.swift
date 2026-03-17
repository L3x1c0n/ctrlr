import Foundation

// MARK: - Wire models (private)

private struct RadarrCalendarItem: Decodable {
    let id:              Int
    let title:           String
    let inCinemas:       String?
    let digitalRelease:  String?
    let physicalRelease: String?
    let images:          [RadarrImage]
    let monitored:       Bool
    let year:            Int
    let hasFile:         Bool
}

private struct RadarrImage: Decodable {
    let coverType: String
    let remoteUrl: String
}

private struct RadarrQueueMovie: Decodable {
    let title:  String
    let images: [RadarrImage]
}

private struct RadarrQueueItem: Decodable {
    let downloadId: String?   // qBittorrent hash (uppercase)
    let title:      String    // torrent name fallback
    let movieId:    Int?
    let movie:      RadarrQueueMovie?
}

private struct RadarrQueueResponse: Decodable {
    let records: [RadarrQueueItem]
}

private struct RadarrSystemStatus: Decodable {
    let version: String
}

private struct RadarrDiskSpace: Decodable {
    let path:      String
    let freeSpace: Int64
    let totalSpace: Int64
}

private struct RadarrMovieFile: Decodable {
    let dateAdded: String?   // ISO8601 — when the file was imported
}

private struct RadarrMovieItem: Decodable {
    let id:        Int
    let title:     String
    let images:    [RadarrImage]
    let movieFile: RadarrMovieFile?   // present only when hasFile = true
}

private struct RadarrWireRelease: Decodable {
    let guid:        String
    let title:       String
    let indexer:     String
    let size:        Int64
    let quality:     RadarrWireQuality
    let indexerId:   Int
    let seeders:     Int?
    let approved:    Bool
    let rejections:  [String]?
}

private struct RadarrWireQuality: Decodable {
    let quality: RadarrWireQualityName
}

private struct RadarrWireQualityName: Decodable {
    let name: String
}

private struct RadarrReleaseGrabBody: Encodable {
    let guid:      String
    let indexerId: Int
}

private struct RadarrMovieState: Decodable {
    let id:               Int
    let qualityProfileId: Int
    let rootFolderPath:   String?
    let monitored:        Bool
    let minimumAvailability: String?
    let tags:             [Int]?
}

// MARK: - RadarrClient

@MainActor
final class RadarrClient: ObservableObject {
    @Published var upcomingMovies:  [UpcomingItem]     = []
    @Published var downloadQueue:   [EnrichedDownload] = []
    @Published var postersByTitle:  [String: String] = [:]   // lowercased title → poster URL
    @Published var recentlyAdded:   [RecentItem]     = []    // top 8 most recently added movies
    @Published var totalDiskBytes:  Int64 = 0
    @Published var freeDiskBytes:   Int64 = 0
    @Published var isConnected = false
    @Published var error: String?

    private var config: ServiceConfig { CredentialStore.shared.load(.radarr) }
    private var pollTask: Task<Void, Never>?
    private var session = URLSession(configuration: .default)

    // One-shot fetch — called on launch, after settings save, and on ntfy import events.
    // No polling loop: Radarr data changes only when something is grabbed/imported.
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
            upcomingMovies = items
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
        if let libraryPosters = try? await fetchAllMoviePosters(cfg) {
            postersByTitle.merge(libraryPosters) { existing, _ in existing }
        }
        // Disk space — deduplicate mount points by path
        if let diskSpaces = try? await fetchDiskSpace(cfg) {
            var seen = Set<String>()
            var total: Int64 = 0
            var free:  Int64 = 0
            for d in diskSpaces where seen.insert(d.path).inserted {
                total += d.totalSpace
                free  += d.freeSpace
            }
            totalDiskBytes = total
            freeDiskBytes  = free
        }
    }

    private func fetchDiskSpace(_ cfg: ServiceConfig) async throws -> [RadarrDiskSpace] {
        guard let url = URL(string: "\(cfg.baseURL)/api/v3/diskspace") else {
            throw NetworkError.badURL
        }
        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        let (data, _) = try await session.data(for: req)
        return try JSONDecoder().decode([RadarrDiskSpace].self, from: data)
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
            URLQueryItem(name: "start",          value: startStr),
            URLQueryItem(name: "end",            value: endStr),
            URLQueryItem(name: "includeHasFile", value: "true")
        ]
        guard let url = components.url else { throw NetworkError.badURL }

        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")

        let (data, _) = try await session.data(for: req)
        let raw = try JSONDecoder().decode([RadarrCalendarItem].self, from: data)

        // Build poster map from calendar items (these have valid TMDB remoteUrls)
        var posters: [String: String] = [:]
        for item in raw {
            let rawURL = item.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? item.images.first?.remoteUrl
            if let url = rawURL, !url.isEmpty {
                posters[item.title.lowercased()] = url
            }
        }
        postersByTitle = posters

        return raw.compactMap { mapToUpcomingItem($0) }
    }

    private func mapToUpcomingItem(_ item: RadarrCalendarItem) -> UpcomingItem? {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        func parseDate(_ str: String?) -> (Date, String)? {
            guard let str else { return nil }
            if let d = iso.date(from: str) { return (d, str) }
            // Try without fractional seconds
            let iso2 = ISO8601DateFormatter()
            iso2.formatOptions = [.withInternetDateTime]
            if let d = iso2.date(from: str) { return (d, str) }
            // Try date-only
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd"
            df.locale = Locale(identifier: "en_US_POSIX")
            if let d = df.date(from: str) { return (d, str) }
            return nil
        }

        var candidates: [(Date, String)] = []
        if let r = parseDate(item.inCinemas)       { candidates.append(r) }
        if let r = parseDate(item.digitalRelease)  { candidates.append(r) }
        if let r = parseDate(item.physicalRelease) { candidates.append(r) }

        guard let (earliest, _) = candidates.min(by: { $0.0 < $1.0 }) else { return nil }

        // Determine which release type was earliest
        var releaseType = "Release"
        if let (d, _) = parseDate(item.inCinemas), d == earliest       { releaseType = "In Cinemas" }
        else if let (d, _) = parseDate(item.digitalRelease), d == earliest  { releaseType = "Digital" }
        else if let (d, _) = parseDate(item.physicalRelease), d == earliest { releaseType = "Physical" }


        return UpcomingItem(
            id:          "radarr-\(item.id)",
            title:       item.title,
            subtitle:    nil,
            mediaType:   .movie,
            airDate:     earliest,
            releaseType: releaseType,
            hasFile:     item.hasFile,
            source:      .radarr,
            posterURL:   postersByTitle[item.title.lowercased()],
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
        let response  = try JSONDecoder().decode(RadarrQueueResponse.self, from: data)

        // Expand poster map with queue items (covers media outside the 14-day calendar window)
        for item in response.records {
            if let movie = item.movie, let mid = item.movieId {
                postersByTitle[movie.title.lowercased()] =
                    "\(cfg.baseURL)/api/v3/mediacover/\(mid)/poster.jpg"
            }
        }

        let headers = ["X-Api-Key": cfg.apiKey]
        return response.records.map { item in
            let poster: String?
            if let mid = item.movieId {
                poster = "\(cfg.baseURL)/api/v3/mediacover/\(mid)/poster.jpg"
            } else {
                poster = item.movie?.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? item.movie?.images.first?.remoteUrl
            }
            return EnrichedDownload(
                hash:          item.downloadId?.lowercased() ?? "",
                title:         item.movie?.title ?? item.title,
                subtitle:      nil,
                posterURL:     poster,
                posterHeaders: poster?.hasPrefix(cfg.baseURL) == true ? headers : [:],
                source:        .radarr
            )
        }
    }

    // MARK: - Full library poster map

    private func fetchAllMoviePosters(_ cfg: ServiceConfig) async throws -> [String: String] {
        guard let url = URL(string: "\(cfg.baseURL)/api/v3/movie") else {
            throw NetworkError.badURL
        }
        var req = URLRequest(url: url)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        let (data, _) = try await session.data(for: req)
        let movies = try JSONDecoder().decode([RadarrMovieItem].self, from: data)

        // Build recently added list — sort by movieFile.dateAdded (actual import date),
        // only include movies that have a file on disk.
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let iso2 = ISO8601DateFormatter()   // fallback without fractional seconds

        let sorted = movies
            .compactMap { m -> (RadarrMovieItem, Date)? in
                guard let str = m.movieFile?.dateAdded else { return nil }
                let d = iso.date(from: str) ?? iso2.date(from: str)
                guard let d else { return nil }
                return (m, d)
            }
            .sorted { $0.1 > $1.1 }
            .prefix(8)
        recentlyAdded = sorted.map { (m, _) in
            RecentItem(id: "radarr-\(m.id)", title: m.title, source: .radarr)
        }

        var map: [String: String] = [:]
        for movie in movies {
            let rawURL = movie.images.first(where: { $0.coverType == "poster" })?.remoteUrl
                      ?? movie.images.first?.remoteUrl
            if let url = rawURL, !url.isEmpty {
                map[movie.title.lowercased()] =
                    "\(cfg.baseURL)/api/v3/mediacover/\(movie.id)/poster.jpg"
            }
        }
        return map
    }

    /// HTTP headers required when fetching Radarr mediacover poster images.
    func posterHeaders() -> [String: String] {
        ["X-Api-Key": config.apiKey]
    }

    // MARK: - Movie lookup + search (for request options)

    func findMovieId(tmdbId: Int) async -> Int? {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/movie?tmdbId=\(tmdbId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        guard let (data, _) = try? await session.data(for: req) else { return nil }
        struct Stub: Decodable { let id: Int }
        return (try? JSONDecoder().decode([Stub].self, from: data))?.first?.id
    }

    func triggerSearch(movieId: Int) async {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/command") else { return }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = "POST"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let name: String; let movieIds: [Int] }
        req.httpBody = try? JSONEncoder().encode(Body(name: "MoviesSearch", movieIds: [movieId]))
        _ = try? await session.data(for: req)
    }

    func fetchReleases(movieId: Int) async -> [MediaRelease] {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/release?movieId=\(movieId)") else { return [] }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        guard let (data, _) = try? await session.data(for: req),
              let releases  = try? JSONDecoder().decode([RadarrWireRelease].self, from: data)
        else { return [] }
        return releases.map {
            MediaRelease(guid: $0.guid, title: $0.title, indexer: $0.indexer,
                         size: $0.size, quality: $0.quality.quality.name,
                         indexerId: $0.indexerId, seeders: $0.seeders,
                         approved: $0.approved, rejections: $0.rejections ?? [])
        }
    }

    func downloadRelease(guid: String, indexerId: Int) async -> Bool {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/release") else { return false }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(RadarrReleaseGrabBody(guid: guid, indexerId: indexerId))
        guard let (_, response) = try? await session.data(for: req),
              let http = response as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
    }

    // MARK: - Movie state fetch + update (for request detail editing)

    func fetchMovieState(tmdbId: Int) async -> (id: Int, qualityProfileId: Int, rootFolderPath: String, monitored: Bool)? {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let url = URL(string: "\(cfg.baseURL)/api/v3/movie?tmdbId=\(tmdbId)") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        guard let (data, _) = try? await session.data(for: req),
              let movies = try? JSONDecoder().decode([RadarrMovieState].self, from: data),
              let movie  = movies.first
        else { return nil }
        return (movie.id, movie.qualityProfileId, movie.rootFolderPath ?? "", movie.monitored)
    }

    func updateMovie(id: Int, qualityProfileId: Int, rootFolderPath: String, monitored: Bool) async -> Bool {
        let cfg = config
        guard !cfg.baseURL.isEmpty,
              let getURL = URL(string: "\(cfg.baseURL)/api/v3/movie/\(id)") else { return false }

        // Fetch full movie object
        var getReq = URLRequest(url: getURL, timeoutInterval: 10)
        getReq.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        getReq.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        guard let (rawData, _) = try? await session.data(for: getReq),
              var json = try? JSONSerialization.jsonObject(with: rawData) as? [String: Any]
        else { return false }

        // Patch only the fields we care about
        json["qualityProfileId"] = qualityProfileId
        json["rootFolderPath"]   = rootFolderPath
        json["monitored"]        = monitored

        guard let putURL  = URL(string: "\(cfg.baseURL)/api/v3/movie/\(id)"),
              let putData = try? JSONSerialization.data(withJSONObject: json)
        else { return false }

        var putReq = URLRequest(url: putURL, timeoutInterval: 15)
        putReq.httpMethod = "PUT"
        putReq.setValue(cfg.apiKey, forHTTPHeaderField: "X-Api-Key")
        putReq.setValue(cfg.baseURL + "/", forHTTPHeaderField: "Referer")
        putReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        putReq.httpBody = putData

        guard let (_, response) = try? await session.data(for: putReq),
              let http = response as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
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
            let status = try JSONDecoder().decode(RadarrSystemStatus.self, from: data)
            return .success("Radarr \(status.version)")
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}
