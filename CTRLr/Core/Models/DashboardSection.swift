import Foundation

// MARK: - AppearanceMode

enum AppearanceMode: String {
    case dark  = "dark"
    case light = "light"
    case auto  = "auto"
}

// MARK: - DashboardSection

enum DashboardSection: String, CaseIterable, Identifiable {
    case downloads    = "downloads"
    case recentlyAdded = "recentlyAdded"
    case upcoming     = "upcoming"
    case requests     = "requests"
    case discover     = "discover"
    case nowPlaying   = "nowPlaying"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .downloads:     return "Downloads"
        case .recentlyAdded: return "Recently Added"
        case .upcoming:      return "Upcoming"
        case .requests:      return "Requests"
        case .discover:      return "Discover"
        case .nowPlaying:    return "Now Playing"
        }
    }

    var systemImage: String {
        switch self {
        case .downloads:     return "arrow.down.circle.fill"
        case .recentlyAdded: return "play.rectangle.fill"
        case .upcoming:      return "calendar"
        case .requests:      return "paperplane.fill"
        case .discover:      return "sparkles"
        case .nowPlaying:    return "waveform"
        }
    }
}

// MARK: - Section tint storage

extension DashboardSection {
    var tintStorageKey: String { "sectionLightTint_\(rawValue)" }

    var defaultLightTint: String {
        switch self {
        case .downloads:     return "#00E5A0"
        case .recentlyAdded: return "#0A84FF"
        case .upcoming:      return "#6366F1"
        case .requests:      return "#A855F7"
        case .discover:      return "#CC2260"
        case .nowPlaying:    return "#1A0A2E"
        }
    }
}

// MARK: - Storage key

enum SectionOrderKey {
    static let appStorage = "dashboardSectionOrder"
    static let defaultValue = DashboardSection.allCases.map(\.rawValue).joined(separator: ",")
}

// MARK: - Decode helper

extension String {
    /// Converts comma-separated rawValue string → ordered [DashboardSection],
    /// appending any newly-added cases not present in the saved string.
    var asSectionOrder: [DashboardSection] {
        let saved = split(separator: ",").compactMap { DashboardSection(rawValue: String($0)) }
        let new   = DashboardSection.allCases.filter { !saved.contains($0) }
        return saved + new
    }
}
