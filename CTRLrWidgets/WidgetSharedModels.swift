import Foundation

// MARK: - Widget snapshot written by the main app, read by widgets

struct WidgetSnapshot: Codable {
    let recentItems:   [WidgetRecentItem]
    let queueItems:    [WidgetQueueItem]
    let upcomingItems: [WidgetUpcomingItem]
    let globalDL:      Int
    let globalUL:      Int
    let updatedAt:     Date
}

// MARK: - Recently downloaded / added

struct WidgetRecentItem: Codable, Identifiable {
    let id:         String
    let title:      String
    let subtitle:   String?   // episode code for TV, nil for movies
    let mediaType:  String    // "movie" | "tv"
    let source:     String    // "plex" | "radarr" | "sonarr"
    var posterData: Data?     // JPEG thumbnail pre-fetched by the main app
}

// MARK: - Active download queue

struct WidgetQueueItem: Codable, Identifiable {
    let id:       String
    let title:    String
    let progress: Double
    let eta:      Int
    let status:   String
    let source:   String   // "radarr" / "sonarr" / "qbittorrent"
}

// MARK: - Upcoming calendar

struct WidgetUpcomingItem: Codable, Identifiable {
    let id:               String
    let title:            String
    let subtitle:         String?
    let releaseType:      String
    let airDateTimestamp: Double
    let hasFile:          Bool
    let source:           String

    var airDate: Date { Date(timeIntervalSince1970: airDateTimestamp) }
}
