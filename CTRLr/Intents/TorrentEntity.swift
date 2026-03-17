import AppIntents

// MARK: - TorrentEntity
//
// Represents a single torrent as an AppEntity, enabling parameterized intents
// like "Pause [torrent name]" where Siri/Shortcuts resolves the specific item.

struct TorrentEntity: AppEntity {
    var id:         String
    var name:       String
    var progress:   Double   // 0.0 – 1.0
    var state:      String
    var etaSeconds: Int

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Torrent")
    static var defaultQuery = TorrentEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        let pct = Int(progress * 100)
        return DisplayRepresentation(
            title:    "\(name)",
            subtitle: "\(pct)% · \(stateLabel)"
        )
    }

    // MARK: - Derived state

    var stateLabel: String {
        switch state {
        case "downloading", "forcedDL": return "Downloading"
        case "uploading",   "forcedUP": return "Seeding"
        case "stalledDL":               return "Stalled"
        case "pausedDL", "stopped":     return "Paused"
        case "metaDL":                  return "Fetching metadata"
        default:                        return state
        }
    }

    var isActiveDownload: Bool {
        ["downloading", "metaDL", "forcedDL", "stalledDL"].contains(state)
    }

    var isPaused: Bool { state.hasPrefix("paused") || state == "stopped" }

    var etaFormatted: String {
        guard etaSeconds > 0, etaSeconds < 8_640_000 else { return "unknown ETA" }
        if etaSeconds < 3600  { return "\(etaSeconds / 60)m" }
        if etaSeconds < 86400 { return "\(etaSeconds / 3600)h \((etaSeconds % 3600) / 60)m" }
        return "\(etaSeconds / 86400)d"
    }
}

// MARK: - TorrentEntityQuery
//
// Powers entity resolution for parameterized intents and Siri disambiguation.

struct TorrentEntityQuery: EntityQuery {
    private let client = QBIntentClient()

    func entities(for identifiers: [String]) async throws -> [TorrentEntity] {
        let all = try await client.fetchTorrents()
        return all.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [TorrentEntity] {
        try await client.fetchTorrents()
    }
}
