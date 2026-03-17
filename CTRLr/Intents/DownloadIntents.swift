import AppIntents
import Foundation

// ============================================================
// MARK: - Phase 1: qBittorrent (fully functional)
// ============================================================

struct GetDownloadStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Get Download Status"
    static var description = IntentDescription(
        "Returns active downloads and current speeds from qBittorrent."
    )

    private let client = QBIntentClient()

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        async let torrentsTask  = client.fetchTorrents()
        async let statsTask     = client.transferStats()
        let (torrents, stats)   = try await (torrentsTask, statsTask)

        let active = torrents.filter { $0.isActiveDownload }
        guard !active.isEmpty else {
            return .result(value: "No active downloads", dialog: "Nothing is downloading right now.")
        }

        let dlSpeed  = formatIntentSpeed(stats.dlSpeed)
        let ulSpeed  = formatIntentSpeed(stats.ulSpeed)
        let topItems = active.prefix(3)
            .map { "\($0.name) – \(Int($0.progress * 100))%" }
            .joined(separator: "; ")

        let summary = "\(active.count) download\(active.count == 1 ? "" : "s") · ↓\(dlSpeed) ↑\(ulSpeed). \(topItems)"
        return .result(value: summary, dialog: IntentDialog(stringLiteral: summary))
    }
}

// ─────────────────────────────────────────────────────────────

struct PauseAllDownloadsIntent: AppIntent {
    static var title: LocalizedStringResource = "Pause All Downloads"
    static var description = IntentDescription(
        "Pauses all active qBittorrent downloads."
    )

    private let client = QBIntentClient()

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await client.pauseAll()
        return .result(dialog: "All downloads paused.")
    }
}

// ─────────────────────────────────────────────────────────────

struct ResumeAllDownloadsIntent: AppIntent {
    static var title: LocalizedStringResource = "Resume All Downloads"
    static var description = IntentDescription(
        "Resumes all paused qBittorrent downloads."
    )

    private let client = QBIntentClient()

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await client.resumeAll()
        return .result(dialog: "Downloads resumed.")
    }
}

// ─────────────────────────────────────────────────────────────

struct PauseTorrentIntent: AppIntent {
    static var title: LocalizedStringResource = "Pause Torrent"
    static var description = IntentDescription(
        "Pauses a specific download by name."
    )

    @Parameter(title: "Torrent")
    var torrent: TorrentEntity

    private let client = QBIntentClient()

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await client.pause(hash: torrent.id)
        return .result(dialog: "Paused \"\(torrent.name)\".")
    }
}

// ─────────────────────────────────────────────────────────────

struct ResumeTorrentIntent: AppIntent {
    static var title: LocalizedStringResource = "Resume Torrent"
    static var description = IntentDescription(
        "Resumes a specific paused download by name."
    )

    @Parameter(title: "Torrent")
    var torrent: TorrentEntity

    private let client = QBIntentClient()

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await client.resume(hash: torrent.id)
        return .result(dialog: "Resumed \"\(torrent.name)\".")
    }
}

// ============================================================
// MARK: - Phase 2: Radarr / Sonarr (stub — add when clients exist)
// ============================================================

// TODO: Phase 2
// struct GetRadarrQueueIntent: AppIntent {
//     static var title: LocalizedStringResource = "Get Movie Queue"
//     static var description = IntentDescription("Returns the current Radarr download queue.")
//     func perform() async throws -> some IntentResult & ProvidesDialog { ... }
// }

// TODO: Phase 2
// struct GetSonarrQueueIntent: AppIntent {
//     static var title: LocalizedStringResource = "Get TV Queue"
//     static var description = IntentDescription("Returns the current Sonarr download queue.")
//     func perform() async throws -> some IntentResult & ProvidesDialog { ... }
// }

// TODO: Phase 2
// struct GetUpcomingReleasesIntent: AppIntent {
//     static var title: LocalizedStringResource = "Get Upcoming Releases"
//     static var description = IntentDescription("Lists movies and episodes releasing soon.")
//     func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> { ... }
// }

// ============================================================
// MARK: - Phase 3: Plex / Tautulli (stub — add when clients exist)
// ============================================================

// TODO: Phase 3
// struct GetActiveStreamsIntent: AppIntent {
//     static var title: LocalizedStringResource = "Get Active Streams"
//     static var description = IntentDescription("Returns who is currently watching on Plex.")
//     func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> { ... }
// }

// ============================================================
// MARK: - Phase 4: Overseerr (stub — add when client exists)
// ============================================================

// TODO: Phase 4
// struct GetPendingRequestsIntent: AppIntent {
//     static var title: LocalizedStringResource = "Get Pending Requests"
//     static var description = IntentDescription("Returns pending Overseerr media requests.")
//     func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> { ... }
// }

// TODO: Phase 4
// struct ApproveRequestIntent: AppIntent {
//     static var title: LocalizedStringResource = "Approve Request"
//     static var description = IntentDescription("Approves an Overseerr media request.")
//     @Parameter(title: "Request") var request: MediaRequestEntity  // entity TBD in Phase 4
//     func perform() async throws -> some IntentResult & ProvidesDialog { ... }
// }
