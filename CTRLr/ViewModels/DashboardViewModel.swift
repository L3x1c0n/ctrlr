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
    let ntfy      = NtfyClient()

    // Published aggregates
    @Published var activeDownloads:   [QBTorrentItem]     = []
    @Published var enrichedDownloads: [EnrichedQBTorrent] = []
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

    private var cancellables = Set<AnyCancellable>()

    init() {
        // ntfy push: Radarr/Sonarr import events trigger a targeted re-fetch.
        // We also start a Plex retry loop — Plex scanning lags behind the import,
        // so we keep re-fetching Plex until a newer item appears or we give up.
        ntfy.onEvent = { [weak self] (source: ServiceSource) in
            guard let self else { return }
            let knownNewest = self.plex.recentlyAdded.first?.addedAt ?? .distantPast
            switch source {
            case .radarr:
                self.radarr.startPolling()
                self.plex.waitForNewItem(newerThan: knownNewest)
            case .sonarr:
                self.sonarr.startPolling()
                self.plex.waitForNewItem(newerThan: knownNewest)
            default:
                break
            }
        }
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

        // Write widget snapshot + update Live Activity on every torrent + stats update
        qbt.$torrents
            .combineLatest(qbt.$transferStats)
            .receive(on: RunLoop.main)
            .sink { [weak self] torrents, stats in
                self?.activeDownloads = torrents
                self?.writeWidgetSnapshot(torrents: torrents, stats: stats)
                self?.updateLiveActivity(torrents: torrents, stats: stats)
            }
            .store(in: &cancellables)

        // Rebuild Plex widget items whenever recently added changes
        plex.$recentlyAdded
            .receive(on: RunLoop.main)
            .sink { [weak self] items in
                self?.schedulePlexWidgetUpdate(items)
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
        connectNtfy()
    }

    func refreshAll() {
        qbt.startPolling()
        radarr.startPolling()
        sonarr.startPolling()
        plex.refresh()
        overseerr.startPolling(force: true)
        tautulli.startPolling()
    }

    private func connectNtfy() {
        let radarrCfg = CredentialStore.shared.load(.radarr)
        let sonarrCfg = CredentialStore.shared.load(.sonarr)
        // ntfy server URL reuses radarr's username field for the topic;
        // we default to ntfy.sh if no custom server is stored.
        ntfy.stop()
        ntfy.start(
            server:       "https://ntfy.sh",
            radarrTopic:  radarrCfg.username,
            sonarrTopic:  sonarrCfg.username
        )
    }

    // MARK: - Rebuild enriched download list

    /// Strips punctuation that appears in media titles but not torrent filenames,
    /// then collapses runs of whitespace into a space-separated word array.
    private func posterKey(_ s: String) -> String {
        var result = s.lowercased()
        for ch: Character in [".", "_", "-", ":", "'", "\u{2019}", "(", ")", "[", "]", "!", "?", "&", ",", "/", "\\"] {
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
        let allPosters = radarr.postersByTitle.merging(sonarr.postersByTitle) { a, _ in a }
        let radarrHeaders = radarr.posterHeaders()
        let sonarrHeaders = sonarr.posterHeaders()
        activeDownloads = qbt.torrents

        enrichedDownloads = qbt.torrents.map { torrent in
            var match = (radarr.downloadQueue + sonarr.downloadQueue)
                .first { $0.hash == torrent.hash.lowercased() }

            // Name-based fallback: normalise both sides then require whole-word match
            // so "US" never matches inside "plus", "focus", etc.
            if match?.posterURL == nil {
                let normalisedName = posterKey(torrent.name)

                if let (key, url) = allPosters.first(where: { titleMatches(normalisedName, posterKey($0.key)) }) {
                    let isSonarr = sonarr.postersByTitle[key] != nil
                    let source: ServiceSource = isSonarr ? .sonarr : .radarr
                    let headers = isSonarr ? sonarrHeaders : radarrHeaders
                    match = EnrichedDownload(
                        hash:         torrent.hash,
                        title:        match?.title ?? torrent.name,
                        subtitle:     match?.subtitle,
                        posterURL:    url,
                        posterHeaders: headers,
                        source:       match?.source ?? source
                    )
                }
            }
            return EnrichedQBTorrent(torrent: torrent, enriched: match)
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

