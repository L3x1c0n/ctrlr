import ActivityKit
import Foundation

// MARK: - LiveActivityManager
//
// Manages a single DownloadActivity for the most-active torrent.
// Called from DashboardViewModel on every torrent poll.
//
// Poster images are written to the shared app group container so the
// widget extension can read them without a network request.

@MainActor
final class LiveActivityManager {

    static let shared = LiveActivityManager()
    private init() {}

    private var currentActivity: Activity<DownloadActivityAttributes>?

    // MARK: - Shared container

    private static let appGroup = "group.com.attakrit.CTRLr"
    private static let posterFilename = "live_activity_poster.jpg"

    private var posterContainerURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup)?
            .appendingPathComponent(Self.posterFilename)
    }

    // MARK: - Public API

    /// Called every poll cycle with the full torrent list + global speeds.
    /// `posterData`: JPEG bytes for the lead torrent, or nil if unavailable.
    func update(torrents: [QBTorrentItem], dlSpeed: Int, ulSpeed: Int, posterData: Data? = nil) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let active = torrents.filter { $0.isActiveDownload && !$0.isPaused }
        guard let lead = active.sorted(by: { $0.progress > $1.progress }).first else {
            end(); return
        }

        // Write poster to shared container if provided
        let posterFilename: String? = writePoster(posterData)

        let state = DownloadActivityAttributes.ContentState(
            torrentName:    lead.name,
            progress:       lead.progress,
            dlSpeed:        dlSpeed,
            ulSpeed:        ulSpeed,
            eta:            lead.eta,
            status:         lead.statusLabel,
            activeCount:    active.count,
            posterFilename: posterFilename
        )

        let content = ActivityContent(state: state, staleDate: nil)

        if let activity = currentActivity {
            Task { await activity.update(content) }
        } else {
            let attrs = DownloadActivityAttributes(torrentHash: lead.hash)
            do {
                currentActivity = try Activity.request(
                    attributes: attrs,
                    content:    content,
                    pushType:   nil
                )
            } catch {
                // ActivityKit unavailable (simulator, iPad without Dynamic Island) — ignore
            }
        }
    }

    // MARK: - End

    func end() {
        guard let activity = currentActivity else { return }
        currentActivity = nil
        // Remove poster from shared container
        if let url = posterContainerURL { try? FileManager.default.removeItem(at: url) }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    // MARK: - Poster helper

    /// Writes JPEG data to the shared container. Returns the filename on success, nil otherwise.
    @discardableResult
    private func writePoster(_ data: Data?) -> String? {
        guard let data, let url = posterContainerURL else { return nil }
        do {
            try data.write(to: url, options: .atomic)
            return Self.posterFilename
        } catch {
            return nil
        }
    }
}
