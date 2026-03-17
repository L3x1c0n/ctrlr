import ActivityKit
import Foundation

// MARK: - DownloadActivityAttributes
//
// Shared between the main app and the widget extension.
// The app starts/updates the activity; the widget renders it.

struct DownloadActivityAttributes: ActivityAttributes {

    // MARK: Dynamic state — updated every poll cycle

    struct ContentState: Codable, Hashable {
        /// Display name of the most-active (highest-progress) torrent.
        var torrentName: String
        /// 0.0 – 1.0 fraction complete.
        var progress: Double
        /// Download speed in bytes/sec.
        var dlSpeed: Int
        /// Upload speed in bytes/sec.
        var ulSpeed: Int
        /// Estimated seconds remaining; 0 = unknown / not seeding.
        var eta: Int
        /// Human-readable status ("Downloading", "Seeding", "Paused", …).
        var status: String
        /// Number of currently active torrents (including this one).
        var activeCount: Int
        /// Filename of the poster JPEG written to the shared app group container.
        /// Nil when no poster is available for this torrent.
        var posterFilename: String?
    }

    // MARK: Static — set once when the activity is started

    /// qBittorrent hash used to track which torrent "owns" this activity.
    var torrentHash: String
}
