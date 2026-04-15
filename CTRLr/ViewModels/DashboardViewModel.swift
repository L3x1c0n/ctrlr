import Combine
import SwiftUI
import WidgetKit

// MARK: - DashboardViewModel

@MainActor
final class DashboardViewModel: ObservableObject {

    // Sub-clients
    let qbt       = QBittorrentClient()
    let radarr    = RadarrClient()
    let sonarr    = SonarrClient()
    let plex      = PlexClient()
    let overseerr = OverseerrClient()
    let tautulli  = TautulliClient()
    let trakt     = TraktClient()

    // Published aggregates
    @Published var activeDownloads:   [QBTorrentItem]     = []
    @Published var enrichedDownloads: [EnrichedQBTorrent] = []
    @Published var discoverSections:  [DiscoverSection]   = []
    @Published var traktUpcoming:     [UpcomingItem]      = []
    @Published var discoverLoadingMore: Set<String>       = []   // mediaType keys currently fetching
    private var discoverPages: [String: Int] = [:]               // current page per mediaType
    @Published var globalDL: Int = 0
    @Published var globalUL: Int = 0

    // Speed history — last 60 readings for the background graph
    @Published var dlHistory: [Int] = []
    @Published var ulHistory: [Int] = []
    private let historyLimit = 60

    // Plex poster thumbnails cached by item id, reused across torrent snapshot writes
    private var plexPosterCache:   [String: Data]         = [:]
    private var cachedRecentItems: [WidgetRecentItem]     = []
    private var plexWidgetTask:    Task<Void, Never>?     = nil

    // Torrent poster thumbnails cached by torrent hash for Live Activity
    private var torrentPosterCache: [String: Data]        = [:]
    private var torrentPosterTask:  Task<Void, Never>?    = nil

    // Known torrent hashes — when a new one appears AFTER startup, trigger a Radarr/Sonarr
    // queue refresh so the initial metadata (poster, title) is fetched once.
    // nil = not yet initialised (first publish skipped); Set = actively tracking.
    private var knownTorrentHashes: Set<String>? = nil

    private var cancellables = Set<AnyCancellable>()

    init() {
qbt.$transferStats
            .receive(on: RunLoop.main)
            .sink { [weak self] stats in
                guard let self else { return }
                self.globalDL = stats.dlSpeed
                self.globalUL = stats.ulSpeed
                self.dlHistory.append(stats.dlSpeed)
                self.ulHistory.append(stats.ulSpeed)
                if self.dlHistory.count > self.historyLimit { self.dlHistory.removeFirst() }
                if self.ulHistory.count > self.historyLimit { self.ulHistory.removeFirst() }
            }
            .store(in: &cancellables)

        // Rebuild enrichedDownloads whenever any upstream source changes
        Publishers.MergeMany(
            qbt.$torrents          .map { _ in () }.eraseToAnyPublisher(),
            radarr.$downloadQueue  .map { _ in () }.eraseToAnyPublisher(),
            sonarr.$downloadQueue  .map { _ in () }.eraseToAnyPublisher(),
            radarr.$postersByTitle .map { _ in () }.eraseToAnyPublisher(),
            sonarr.$postersByTitle .map { _ in () }.eraseToAnyPublisher()
        )
        .receive(on: RunLoop.main)
        .sink { [weak self] in self?.rebuild() }
        .store(in: &cancellables)

        // Write widget snapshot + update Live Activity on every torrent + stats update.
        // Also detect new hashes — triggers a lightweight Radarr/Sonarr queue refresh so
        // the initial metadata (poster, title) is available before the first rebuild().
        qbt.$torrents
            .combineLatest(qbt.$transferStats)
            .receive(on: RunLoop.main)
            .sink { [weak self] torrents, stats in
                guard let self else { return }
                self.activeDownloads = torrents
                self.writeWidgetSnapshot(torrents: torrents, stats: stats)
                self.updateLiveActivity(torrents: torrents, stats: stats)

                let incoming = Set(torrents.map { $0.hash })
                if let known = self.knownTorrentHashes {
                    let newHashes = incoming.subtracting(known)
                    self.knownTorrentHashes = incoming
                    if !newHashes.isEmpty {
                        Task {
                            await self.radarr.refreshQueue()
                            await self.sonarr.refreshQueue()
                        }
                    }
                } else {
                    // First publish — initialise without triggering refresh;
                    // the full poll() already ran fetchQueue at startup.
                    self.knownTorrentHashes = incoming
                }
            }
            .store(in: &cancellables)

        // Rebuild Plex widget items whenever recently added changes
        plex.$recentlyAdded
            .receive(on: RunLoop.main)
            .sink { [weak self] items in
                self?.schedulePlexWidgetUpdate(items)
            }
            .store(in: &cancellables)

        // Fetch Discover as soon as Overseerr becomes connected — avoids the startup
        // race where fetchDiscover() fires before isConnected = true (poll not yet done).
        overseerr.$isConnected
            .removeDuplicates()
            .filter { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self, self.discoverSections.isEmpty else { return }
                self.fetchDiscover()
            }
            .store(in: &cancellables)

        // Fetch Trakt calendar as soon as connected (handles both stored-credential
        // startup and first-time OAuth connect after startAll() has already run).
        trakt.$isConnected
            .removeDuplicates()
            .filter { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { self.traktUpcoming = await self.trakt.fetchUpcoming() }
            }
            .store(in: &cancellables)

        startAll()
    }

    func startAll() {
        qbt.startPolling()
        radarr.startPolling()
        sonarr.startPolling()
        plex.startPolling()
        overseerr.startPolling()
        tautulli.startPolling()
        fetchDiscover()
    }

    func refreshAll() {
        qbt.startPolling()
        radarr.startPolling()
        sonarr.startPolling()
        plex.refresh()
        overseerr.startPolling(force: true)
        tautulli.startPolling()
        fetchDiscover()
        Task { traktUpcoming = await trakt.fetchUpcoming() }
    }

    func fetchDiscover() {
        discoverPages = [:]          // reset pagination on full refresh
        Task { await loadDiscover() }
    }

    private func loadDiscover() async {
        guard overseerr.isConnected else { return }
        async let moviesTask = overseerr.fetchTrending(mediaType: "movie", page: 1)
        async let tvTask     = overseerr.fetchTrending(mediaType: "tv",    page: 1)
        let (movies, tv) = await (moviesTask, tvTask)

        var sections: [DiscoverSection] = []
        if !movies.isEmpty {
            sections.append(DiscoverSection(
                id: "trending-movies", seedTitle: "Trending Movies",
                seedPosterPath: nil, mediaType: "movie", items: movies))
            discoverPages["movie"] = 1
        }
        if !tv.isEmpty {
            sections.append(DiscoverSection(
                id: "trending-tv", seedTitle: "Trending TV Shows",
                seedPosterPath: nil, mediaType: "tv", items: tv))
            discoverPages["tv"] = 1
        }
        // Only replace if we got data — preserve existing content on timeout/failure
        if !sections.isEmpty {
            discoverSections = sections
        }
    }

    /// Fetches the next page of trending content for one media type and appends it.
    func loadMoreDiscover(mediaType: String) {
        guard !discoverLoadingMore.contains(mediaType) else { return }
        discoverLoadingMore.insert(mediaType)
        Task {
            let nextPage = (discoverPages[mediaType] ?? 1) + 1
            let newItems = await overseerr.fetchTrending(mediaType: mediaType, page: nextPage)
            if !newItems.isEmpty {
                discoverPages[mediaType] = nextPage
                if let idx = discoverSections.firstIndex(where: { $0.mediaType == mediaType }) {
                    discoverSections[idx].items += newItems
                }
            }
            discoverLoadingMore.remove(mediaType)
        }
    }

    func clearAllCaches() {
        plex.clearCache()
        tautulli.clearCache()
        overseerr.clearCache()
        cachedRecentItems = []
        plexPosterCache   = [:]
        torrentPosterCache = [:]
        Task { await ArtworkCache.shared.clearAll() }
        refreshAll()
    }

    // MARK: - Rebuild enriched download list

    /// Strips punctuation that appears in media titles but not torrent filenames,
    /// then collapses runs of whitespace into a space-separated word array.
    private func posterKey(_ s: String) -> String {
        var result = s.lowercased()
        // Apostrophes (straight + curly) are REMOVED so "I'm" → "im", "You're" → "youre"
        // matching how torrent names omit them. Everything else becomes a space.
        for ch: Character in ["'", "\u{2019}", "`"] {
            result = result.replacingOccurrences(of: String(ch), with: "")
        }
        for ch: Character in [".", "_", "-", ":", "(", ")", "[", "]", "!", "?", "&", ",", "/", "\\"] {
            result = result.replacingOccurrences(of: String(ch), with: " ")
        }
        return result
            .components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Returns true only when every word in `needle` appears as a contiguous
    /// whole-word sequence inside `haystack`. Prevents short titles like "US"
    /// or "IT" from substring-matching inside words like "plus" or "with".
    private func titleMatches(_ haystack: String, _ needle: String) -> Bool {
        let h = haystack.components(separatedBy: " ")
        let n = needle.components(separatedBy: " ")
        guard !n.isEmpty, n.count <= h.count else { return false }
        for i in 0...(h.count - n.count) {
            if h[i..<(i + n.count)].elementsEqual(n) { return true }
        }
        return false
    }

    private func rebuild() {
        let allPosters    = radarr.postersByTitle.merging(sonarr.postersByTitle) { a, _ in a }
        let radarrHeaders = radarr.posterHeaders()
        let sonarrHeaders = sonarr.posterHeaders()
        activeDownloads   = qbt.torrents

        enrichedDownloads = qbt.torrents.map { torrent in

            // 1. Name-based poster match (primary — was reliable for a long time).
            //    Normalise both sides then require whole-word match so short titles
            //    like "US" don't match inside words like "plus" or "focus".
            let normalisedName = posterKey(torrent.name)
            var namePosterURL:     String? = nil
            var namePosterHeaders: [String: String] = [:]
            if let (key, url) = allPosters.first(where: { titleMatches(normalisedName, posterKey($0.key)) }) {
                let isSonarr = sonarr.postersByTitle[key] != nil
                namePosterURL     = url
                namePosterHeaders = isSonarr ? sonarrHeaders : radarrHeaders
            }

            // 2. Radarr/Sonarr queue hash match (redundancy — provides clean title,
            //    episode subtitle, and source; also supplies a poster when name match missed).
            let queueMatch = (radarr.downloadQueue + sonarr.downloadQueue)
                .first { $0.hash == torrent.hash.lowercased() }

            // Merge: name-based poster takes priority; queue metadata enriches title/subtitle.
            let merged: EnrichedDownload
            if let q = queueMatch {
                merged = EnrichedDownload(
                    hash:          torrent.hash,
                    title:         q.title,
                    subtitle:      q.subtitle,
                    posterURL:     namePosterURL     ?? q.posterURL,
                    posterHeaders: namePosterURL != nil ? namePosterHeaders : q.posterHeaders,
                    source:        q.source
                )
            } else if let url = namePosterURL {
                merged = EnrichedDownload(
                    hash:          torrent.hash,
                    title:         torrent.name,
                    posterURL:     url,
                    posterHeaders: namePosterHeaders,
                    source:        .radarr   // best guess — poster came from Radarr or Sonarr
                )
            } else {
                return EnrichedQBTorrent(torrent: torrent, enriched: nil)
            }

            return EnrichedQBTorrent(torrent: torrent, enriched: merged)
        }
    }

    // MARK: - Widget snapshot

    private func writeWidgetSnapshot(torrents: [QBTorrentItem], stats: QBTransferStats) {
        // Only pass active downloads to the widget — completed/seeded torrents add no value
        // and can balloon the snapshot to hundreds of items, OOMing the widget extension.
        let active = torrents.filter { $0.isActiveDownload || $0.isPaused }
        let queueItems = active.prefix(20).map {
            WidgetQueueItem(id: $0.id, title: $0.name, progress: $0.progress,
                            eta: $0.eta, status: $0.statusLabel, source: "qbittorrent")
        }
        let snapshot = WidgetSnapshot(
            recentItems:   cachedRecentItems,
            queueItems:    queueItems,
            upcomingItems: [],
            globalDL:      stats.dlSpeed,
            globalUL:      stats.ulSpeed,
            updatedAt:     .now
        )
        if let data = try? JSONEncoder().encode(snapshot) {
            UserDefaults.shared.set(data, forKey: SharedDefaultsKey.widgetSnapshot)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Plex widget items

    private func schedulePlexWidgetUpdate(_ items: [PlexRecentItem]) {
        plexWidgetTask?.cancel()
        plexWidgetTask = Task { await self.buildPlexWidgetItems(items) }
    }

    private func buildPlexWidgetItems(_ items: [PlexRecentItem]) async {
        // Deduplicate: movies by id, TV shows by title (keep most-recent episode per show).
        // Items arrive sorted newest-first from Plex.
        var seenTVTitles = Set<String>()
        let deduplicated = items.filter { item in
            if item.mediaType == .tv {
                return seenTVTitles.insert(item.title).inserted
            }
            return true
        }
        let candidates = Array(deduplicated.prefix(6))

        // Evict poster cache for IDs no longer needed
        let currentIDs = Set(candidates.map(\.id))
        plexPosterCache = plexPosterCache.filter { currentIDs.contains($0.key) }

        var result: [WidgetRecentItem] = []
        for item in candidates {
            if Task.isCancelled { return }
            var posterData = plexPosterCache[item.id]
            if posterData == nil, let urlStr = item.posterURL, let url = URL(string: urlStr) {
                if let (raw, _) = try? await URLSession.shared.data(from: url) {
                    posterData = posterThumbnail(from: raw)
                    if let pd = posterData { plexPosterCache[item.id] = pd }
                }
            }
            result.append(WidgetRecentItem(
                id:        item.id,
                title:     item.title,
                subtitle:  item.subtitle,
                mediaType: item.mediaType == .movie ? "movie" : "tv",
                source:    "plex",
                posterData: posterData
            ))
        }
        guard !Task.isCancelled else { return }
        cachedRecentItems = result
        // Write a fresh snapshot so the widget picks up the new posters immediately
        let torrents = qbt.torrents
        let stats    = qbt.transferStats
        writeWidgetSnapshot(torrents: torrents, stats: stats)
    }

    /// Resize to a small thumbnail to keep UserDefaults data under control.
    private func posterThumbnail(from data: Data, targetWidth: CGFloat = 120) -> Data? {
        guard let img = UIImage(data: data) else { return nil }
        let scale    = targetWidth / img.size.width
        let size     = CGSize(width: targetWidth, height: img.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }.jpegData(compressionQuality: 0.5)
    }

    // MARK: - Live Activity

    private func updateLiveActivity(torrents: [QBTorrentItem], stats: QBTransferStats) {
        // Find the lead torrent (highest-progress active download)
        let lead = torrents
            .filter { $0.isActiveDownload && !$0.isPaused }
            .sorted { $0.progress > $1.progress }
            .first

        guard let lead else {
            LiveActivityManager.shared.end()
            return
        }

        // Use cached poster if available, then kick off a background fetch if not
        let poster = torrentPosterCache[lead.hash]
        LiveActivityManager.shared.update(
            torrents:   torrents,
            dlSpeed:    stats.dlSpeed,
            ulSpeed:    stats.ulSpeed,
            posterData: poster
        )

        // Fetch poster in background if we don't have one yet
        if poster == nil {
            let posterURL = enrichedDownloads
                .first { $0.torrent.hash == lead.hash }?
                .posterURL
            if let posterURL {
                prefetchTorrentPoster(hash: lead.hash, urlString: posterURL,
                                      torrents: torrents, stats: stats)
            }
        }
    }

    private func prefetchTorrentPoster(hash: String, urlString: String,
                                       torrents: [QBTorrentItem], stats: QBTransferStats) {
        let headers = enrichedDownloads.first { $0.torrent.hash == hash }?.posterHeaders ?? [:]
        torrentPosterTask?.cancel()
        torrentPosterTask = Task {
            guard let url = URL(string: urlString) else { return }
            var req = URLRequest(url: url)
            headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
            guard let (raw, _) = try? await URLSession.shared.data(for: req) else { return }
            let thumb = posterThumbnail(from: raw, targetWidth: 80)
            guard !Task.isCancelled, let thumb else { return }
            torrentPosterCache[hash] = thumb
            // Re-update the live activity now that we have the poster
            LiveActivityManager.shared.update(
                torrents:   torrents,
                dlSpeed:    stats.dlSpeed,
                ulSpeed:    stats.ulSpeed,
                posterData: thumb
            )
        }
    }
}

