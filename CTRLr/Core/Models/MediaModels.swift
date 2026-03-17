import Foundation
import SwiftUI

// MARK: - Shared enums

enum MediaType: String, Codable, Hashable {
    case movie, tv, music
}

enum ServiceSource: String, Codable, Hashable, CaseIterable {
    case radarr, sonarr, overseerr, plex, tautulli, qbittorrent

    var color: Color {
        switch self {
        case .radarr:      return Color(hex: "#FFC230")
        case .sonarr:      return Color(hex: "#35C5F4")
        case .overseerr:   return Color(hex: "#6366F1")
        case .plex:        return Color(hex: "#E5A00D")
        case .tautulli:    return Color(hex: "#FF7F50")
        case .qbittorrent: return Color(hex: "#00E5A0")
        }
    }

    var displayName: String { rawValue.capitalized }
}

// MARK: - Download item (unified across qBit + Radarr/Sonarr queue)

struct DownloadItem: Identifiable, Hashable {
    let id:        String
    let title:     String
    let mediaType: MediaType
    let progress:  Double    // 0.0 – 1.0
    let dlSpeed:   Int       // bytes/s
    let eta:       Int       // seconds, 0 = unknown
    let status:    String
    let source:    ServiceSource
    var posterData: Data?

    var etaFormatted: String {
        guard eta > 0, eta < 8_640_000 else { return "∞" }
        if eta < 3600  { return "\(eta / 60)m" }
        if eta < 86400 { return "\(eta / 3600)h \((eta % 3600) / 60)m" }
        return "\(eta / 86400)d"
    }
}

// MARK: - Upcoming release

struct UpcomingItem: Identifiable, Hashable {
    let id:          String
    let title:       String
    let subtitle:    String?   // episode info for TV
    let mediaType:   MediaType
    let airDate:     Date
    let releaseType: String    // "In Cinemas" / "Digital" / "Airing" / "Physical"
    let hasFile:     Bool
    let source:      ServiceSource
    var posterURL:   String?
    var posterData:  Data?

    var daysFromToday: Int {
        let cal = Calendar.current
        return cal.dateComponents([.day],
            from: cal.startOfDay(for: Date()),
            to:   cal.startOfDay(for: airDate)).day ?? 0
    }

    var dateLabel: String {
        if hasFile        { return "Downloaded" }
        if daysFromToday < 0  { return "Aired" }
        if daysFromToday == 0 { return "Today" }
        if daysFromToday == 1 { return "Tomorrow" }
        return "in \(daysFromToday)d"
    }

    var dateLabelColor: Color {
        if hasFile            { return Color(hex: "#00E5A0").opacity(0.7) }
        if daysFromToday < 0  { return Color(hex: "#FF6B35") }
        if daysFromToday == 0 { return Color(hex: "#FFD32A") }
        return .white.opacity(0.5)
    }
}

// MARK: - Active stream (Plex / Tautulli)

struct ActiveStream: Identifiable, Hashable {
    let id:         String
    let title:      String
    let subtitle:   String?
    let mediaType:  MediaType
    let userName:   String
    let progress:   Double     // 0.0 – 1.0
    let duration:   Int        // seconds
    let viewOffset: Int        // seconds
    let state:      String     // playing / paused / buffering
    let transcoding: Bool
    let bitrate:    Int        // kbps
    var posterURL:    String?
    var backdropData: Data?
    var posterData:   Data?

    var timeRemaining: String {
        let rem = duration - viewOffset
        guard rem > 0 else { return "0m" }
        if rem < 3600 { return "\(rem / 60)m" }
        return "\(rem / 3600)h \((rem % 3600) / 60)m"
    }
}

// MARK: - Overseerr request

struct MediaRequest: Identifiable, Hashable {
    let id:         Int
    let title:      String
    let mediaType:  MediaType
    let status:     RequestStatus
    let requester:  String
    let requestedAt: Date
    var posterData: Data?

    enum RequestStatus: String, Codable {
        case pending   = "1"
        case approved  = "2"
        case declined  = "3"
        case available = "5"

        var label: String {
            switch self {
            case .pending:   return "Pending"
            case .approved:  return "Approved"
            case .declined:  return "Declined"
            case .available: return "Available"
            }
        }

        var color: Color {
            switch self {
            case .pending:   return Color(hex: "#FFD32A")
            case .approved:  return Color(hex: "#00E5A0")
            case .declined:  return Color(hex: "#FF4757")
            case .available: return Color(hex: "#0A84FF")
            }
        }
    }
}

// MARK: - Library stats (Tautulli)

struct LibraryStats {
    let totalPlaysToday: Int
    let totalDuration:   String  // formatted
    let bandwidth:       Int     // kbps
}

// MARK: - Recently added item (from Radarr/Sonarr library)

struct RecentItem: Identifiable {
    let id:       String   // "radarr-123" / "sonarr-456"
    let title:    String
    let source:   ServiceSource
}

// MARK: - Plex recently added item

struct PlexRecentItem: Identifiable, Codable {
    let id:             String    // Plex ratingKey
    let title:          String    // show title for episodes, movie title for movies
    let subtitle:       String?   // episode title (TV only)
    let mediaType:      MediaType
    let year:           Int?
    let posterURL:      String?
    let backdropURL:    String?
    let addedAt:        Date
    let isWatched:      Bool
    let summary:        String?
    let videoResolution: String?  // "4k", "1080", "720", "sd"
    let videoCodec:     String?
    let audioCodec:     String?
    let bitrate:        Int?      // kbps

    /// Human-readable resolution label e.g. "4K", "1080p", "720p"
    var resolutionLabel: String? {
        switch videoResolution?.lowercased() {
        case "4k":   return "4K"
        case "1080": return "1080p"
        case "720":  return "720p"
        case "480":  return "480p"
        case "sd":   return "SD"
        case let r?: return r.uppercased()
        default:     return nil
        }
    }

    var bitrateLabel: String? {
        guard let b = bitrate, b > 0 else { return nil }
        return b >= 1000 ? String(format: "%.1f Mbps", Double(b) / 1000) : "\(b) kbps"
    }
}

// MARK: - Enriched download (qBit cross-referenced with Radarr/Sonarr)

struct EnrichedDownload: Identifiable {
    let hash:         String
    let title:        String
    let subtitle:     String?   // episode info for TV
    let posterURL:    String?
    let posterHeaders: [String: String]
    let source:       ServiceSource

    var id: String { hash }

    init(hash: String, title: String, subtitle: String? = nil,
         posterURL: String? = nil, posterHeaders: [String: String] = [:],
         source: ServiceSource) {
        self.hash          = hash
        self.title         = title
        self.subtitle      = subtitle
        self.posterURL     = posterURL
        self.posterHeaders = posterHeaders
        self.source        = source
    }
}

struct EnrichedQBTorrent: Identifiable {
    let torrent:  QBTorrentItem
    let enriched: EnrichedDownload?

    var id: String { torrent.id }
    var title: String { enriched?.title ?? torrent.name }
    var subtitle: String? { enriched?.subtitle }
    var posterURL: String? { enriched?.posterURL }
    var posterHeaders: [String: String] { enriched?.posterHeaders ?? [:] }
}

// MARK: - Overseerr

enum OverseerrRequestStatus: Int, Codable {
    case unknown   = 0
    case pending   = 1
    case approved  = 2
    case declined  = 3
    case available = 4

    var label: String {
        switch self {
        case .pending:   return "Pending"
        case .approved:  return "Approved"
        case .declined:  return "Declined"
        case .available: return "Available"
        default:         return "Unknown"
        }
    }

    var color: Color {
        switch self {
        case .pending:   return Color(hex: "#FF9F43")
        case .approved:  return Color(hex: "#0A84FF")
        case .declined:  return Color(hex: "#FF4757")
        case .available: return Color(hex: "#00E5A0")
        default:         return .white.opacity(0.4)
        }
    }
}

struct OverseerrRequest: Identifiable, Codable {
    let id:          Int
    let status:      OverseerrRequestStatus  // approval status (Pending/Approved/Declined)
    let mediaType:   String      // "movie" | "tv"
    let tmdbId:      Int?
    let requestedBy: String
    let createdAt:   Date?
    var title:       String?
    var posterPath:  String?
    var mediaStatus: Int?        // media availability (5 = available/in library)

    var posterURL: String? { posterPath.map { "https://image.tmdb.org/t/p/w342\($0)" } }
    var isInLibrary: Bool { mediaStatus == 5 }
    var isPartiallyAvailable: Bool { mediaStatus == 4 }
}

struct OverseerrSearchResult: Identifiable {
    let id:              Int         // TMDB ID
    let mediaType:       String      // "movie" | "tv"
    let title:           String
    let year:            String?
    let posterPath:      String?
    let overview:        String?
    let mediaStatus:     Int?        // nil = not in Overseerr; 5 = available
    let numberOfSeasons: Int?        // TV only — used to build seasons array for requests
    let requestId:       Int?        // Overseerr internal request ID (from mediaInfo.requests[0])

    var posterURL: String? { posterPath.map { "https://image.tmdb.org/t/p/w342\($0)" } }
    var isAvailable: Bool { mediaStatus == 5 }
    var isRequested: Bool { [2, 3, 4].contains(mediaStatus ?? -1) }

    /// Synthesise an OverseerrRequest for navigation into RequestDetailSheet.
    func asRequest() -> OverseerrRequest? {
        guard let rid = requestId else { return nil }
        return OverseerrRequest(
            id:          rid,
            status:      OverseerrRequestStatus(rawValue: mediaStatus ?? 1) ?? .unknown,
            mediaType:   mediaType,
            tmdbId:      id,
            requestedBy: "",
            createdAt:   nil,
            title:       title,
            posterPath:  posterPath
        )
    }
}

// MARK: - Overseerr service configuration

struct OverseerrServiceOptions {
    let serverId:    Int
    let profiles:    [OverseerrQualityProfile]
    let rootFolders: [OverseerrRootFolder]
}

struct OverseerrQualityProfile: Identifiable, Hashable {
    let id:   Int
    let name: String
}

struct OverseerrRootFolder: Identifiable, Hashable {
    let id:   Int
    let path: String
}

// MARK: - Overseerr rich media info

struct OverseerrCastMember: Identifiable {
    let id:          Int
    let name:        String
    let character:   String?
    let profilePath: String?
    var profileURL:  String? { profilePath.map { "https://image.tmdb.org/t/p/w185\($0)" } }
}

struct OverseerrMediaInfo {
    let title:            String
    let overview:         String?
    let posterPath:       String?
    let backdropPath:     String?
    let voteAverage:      Double?
    let certification:    String?   // e.g. "PG-13", "TV-MA"
    let runtime:          Int?      // minutes per movie / episode
    let releaseDate:      String?   // "YYYY-MM-DD"
    let genres:           [String]
    let cast:             [OverseerrCastMember]
    let directors:        [String]  // Director for movies, Creator for TV
    let studios:          [String]  // Production companies (movie) or networks (TV)
    // TV extras
    let numberOfSeasons:  Int?
    let numberOfEpisodes: Int?

    var posterURL:   String? { posterPath.map   { "https://image.tmdb.org/t/p/w342\($0)" } }
    var backdropURL: String? { backdropPath.map { "https://image.tmdb.org/t/p/w780\($0)" } }

    var runtimeFormatted: String? {
        guard let r = runtime, r > 0 else { return nil }
        return r >= 60 ? "\(r / 60)h \(r % 60)m" : "\(r)m"
    }

    var year: String? { releaseDate.map { String($0.prefix(4)) } }

    var ratingFormatted: String? {
        guard let v = voteAverage, v > 0 else { return nil }
        return String(format: "%.1f", v)
    }
}

// MARK: - Media release (Radarr/Sonarr interactive search)

struct MediaRelease: Identifiable {
    let guid:       String
    let title:      String
    let indexer:    String
    let size:       Int64
    let quality:    String
    let indexerId:  Int
    let seeders:    Int?
    let approved:   Bool
    let rejections: [String]

    var id: String { guid }

    var sizeFormatted: String {
        let gb = Double(size) / 1_073_741_824
        return gb >= 1 ? String(format: "%.1f GB", gb) : String(format: "%.0f MB", Double(size) / 1_048_576)
    }
}

// MARK: - Color hex init

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: h).scanHexInt64(&int)
        let r, g, b, a: Double
        switch h.count {
        case 6:
            (r, g, b, a) = (Double((int >> 16) & 0xFF)/255,
                            Double((int >> 8)  & 0xFF)/255,
                            Double( int        & 0xFF)/255, 1)
        case 8:
            (r, g, b, a) = (Double((int >> 24) & 0xFF)/255,
                            Double((int >> 16) & 0xFF)/255,
                            Double((int >> 8)  & 0xFF)/255,
                            Double( int        & 0xFF)/255)
        default:
            (r, g, b, a) = (0, 0, 0, 1)
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
