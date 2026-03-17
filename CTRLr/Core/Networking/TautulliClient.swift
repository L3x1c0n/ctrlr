import Foundation
import SwiftUI

// MARK: - Public domain models

struct TautulliLibraryStat: Identifiable, Codable {
    var id: String { type }
    let type:  String   // "movie" | "show" | "artist"
    let count: Int

    var label: String {
        switch type {
        case "movie":  return "Movies"
        case "show":   return "TV Shows"
        case "artist": return "Music"
        case "photo":  return "Photos"
        default:       return type.capitalized
        }
    }
    var color: Color {
        switch type {
        case "movie":  return Color(hex: "#E040FB")   // electric violet
        case "show":   return Color(hex: "#39FF14")   // neon safety orange
        case "artist": return Color(hex: "#FFAA00")   // hot amber
        case "photo":  return Color(hex: "#FF4D6D")   // coral rose
        default:       return .white.opacity(0.3)
        }
    }
}

struct TautulliDriveStat: Identifiable, Codable {
    var id: String { "\(sectionId)" }
    let sectionId:  Int
    let name:       String   // e.g. "Movies", "4K Movies"
    let type:       String   // "movie" | "show" | "artist"
    let count:      Int
    let totalBytes: Int64

    var typeColor: Color {
        switch type {
        case "movie":  return Color(hex: "#FFC230")
        case "show":   return Color(hex: "#35C5F4")
        case "artist": return Color(hex: "#A855F7")
        default:       return .white.opacity(0.3)
        }
    }
    var typeIcon: String {
        switch type {
        case "movie":  return "film.stack"
        case "show":   return "tv"
        case "artist": return "music.note"
        default:       return "folder"
        }
    }
    var formattedSize: String {
        guard totalBytes > 0 else { return "—" }
        let tb = 1_099_511_627_776.0
        let gb = 1_073_741_824.0
        let d  = Double(totalBytes)
        if d >= tb { return String(format: "%.1f TB", d / tb) }
        if d >= gb { return String(format: "%.1f GB", d / gb) }
        return String(format: "%.1f MB", d / 1_048_576.0)
    }
    var formattedCount: String {
        count >= 1_000
            ? String(format: "%.1fK", Double(count) / 1000)
            : "\(count)"
    }
}

struct TautulliDayPlays: Identifiable, Codable {
    var id: String { label }
    let label:  String   // e.g. "Mon", "Tue"
    let movies: Int
    let tv:     Int
    var total:  Int { movies + tv }
}

// MARK: - Wire models (private)

private struct TautulliResponse<T: Decodable>: Decodable {
    let response: TautulliOuter<T>
}
private struct TautulliOuter<T: Decodable>: Decodable {
    let result: String
    let data:   T?
}

// Activity
private struct TautulliActivityData: Decodable {
    let sessions: [TautulliSession]?
}
private struct TautulliSession: Decodable {
    let sessionId:        String?
    let user:             String?
    let friendlyName:     String?
    let title:            String?
    let grandparentTitle: String?
    let mediaIndex:       String?
    let parentMediaIndex: String?
    let mediaType:        String?
    let progressPercent:  String?
    let viewOffset:       String?
    let duration:         String?
    let state:            String?
    let videoDecision:    String?
    let audioDecision:    String?
    let bitrate:          String?
    let thumb:            String?
    let grandparentThumb: String?

    enum CodingKeys: String, CodingKey {
        case sessionId        = "session_id"
        case user
        case friendlyName     = "friendly_name"
        case title
        case grandparentTitle = "grandparent_title"
        case mediaIndex       = "media_index"
        case parentMediaIndex = "parent_media_index"
        case mediaType        = "media_type"
        case progressPercent  = "progress_percent"
        case viewOffset       = "view_offset"
        case duration
        case state
        case videoDecision    = "video_decision"
        case audioDecision    = "audio_decision"
        case bitrate
        case thumb
        case grandparentThumb = "grandparent_thumb"
    }
}

// Libraries
private struct TautulliLibrariesOuter: Decodable {
    // Tautulli wraps array in response.data directly
    let sections: [TautulliLibraryWire]?

    init(from decoder: Decoder) throws {
        // data is a direct array at the TautulliOuter<T> level
        let container = try decoder.singleValueContainer()
        sections = try? container.decode([TautulliLibraryWire].self)
    }
}
private struct TautulliLibraryWire: Decodable {
    let sectionId:   FlexInt?
    let sectionName: FlexString
    let sectionType: FlexString
    let count:       FlexInt?
    enum CodingKeys: String, CodingKey {
        case sectionId   = "section_id"
        case sectionName = "section_name"
        case sectionType = "section_type"
        case count
    }
}

// Plays by date
private struct TautulliPlaysDateOuter: Decodable {
    let categories: [String]
    let series:     [TautulliSeriesWire]
}
private struct TautulliSeriesWire: Decodable {
    let name: String
    let data: [Int]
}

// Server info
private struct TautulliServerInfo: Decodable {
    let pmsVersion: String?
    enum CodingKeys: String, CodingKey { case pmsVersion = "pms_version" }
}

// Flexible decoders for Tautulli's inconsistent types
private struct FlexInt: Decodable {
    let value: Int
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self)          { value = i }
        else if let s = try? c.decode(String.self)  { value = Int(s) ?? 0 }
        else                                         { value = 0 }
    }
}
private struct FlexInt64: Decodable {
    let value: Int64
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int64.self)         { value = i }
        else if let s = try? c.decode(String.self)   { value = Int64(s) ?? 0 }
        else                                          { value = 0 }
    }
}
private struct FlexString: Decodable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        value = (try? c.decode(String.self)) ?? ""
    }
}

// MARK: - TautulliClient

@MainActor
final class TautulliClient: ObservableObject {
    @Published var streams:       [ActiveStream]         = []
    @Published var libraryCounts: [TautulliLibraryStat]  = []
    @Published var driveStats:    [TautulliDriveStat]    = []
    @Published var dailyPlays:    [TautulliDayPlays]     = []
    @Published var isConnected:   Bool = false
    @Published var error:         String?

    private var config:       ServiceConfig { CredentialStore.shared.load(.tautulli) }
    private var pollTask:     Task<Void, Never>?
    private let session =     URLSession(configuration: .default)
    private var statsCounter: Int = 0

    init() { loadCache() }

    // MARK: - Cache

    private enum CacheKey {
        static let libraryCounts = "cache_tautulli_libraryCounts"
        static let driveStats    = "cache_tautulli_driveStats"
        static let dailyPlays    = "cache_tautulli_dailyPlays"
    }

    private func loadCache() {
        let ud = UserDefaults.standard
        if let d = ud.data(forKey: CacheKey.libraryCounts),
           let v = try? JSONDecoder().decode([TautulliLibraryStat].self, from: d) {
            libraryCounts = v
        }
        if let d = ud.data(forKey: CacheKey.driveStats),
           let v = try? JSONDecoder().decode([TautulliDriveStat].self, from: d) {
            driveStats = v
        }
        if let d = ud.data(forKey: CacheKey.dailyPlays),
           let v = try? JSONDecoder().decode([TautulliDayPlays].self, from: d) {
            dailyPlays = v
        }
    }

    private func saveCache() {
        let ud = UserDefaults.standard
        if let d = try? JSONEncoder().encode(libraryCounts) { ud.set(d, forKey: CacheKey.libraryCounts) }
        if let d = try? JSONEncoder().encode(driveStats)    { ud.set(d, forKey: CacheKey.driveStats) }
        if let d = try? JSONEncoder().encode(dailyPlays)    { ud.set(d, forKey: CacheKey.dailyPlays) }
    }

    func startPolling() {
        pollTask?.cancel()
        statsCounter = 0
        pollTask = Task { [weak self] in
            await self?.fetchAll()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                await self?.fetchAll()
            }
        }
    }

    func stopPolling() { pollTask?.cancel() }

    // MARK: - Fetch all

    private func fetchAll() async {
        await fetchActivity()
        statsCounter += 1
        // Fetch stats on first call and every 5th (every ~2.5 min)
        if statsCounter == 1 || statsCounter % 5 == 0 {
            await fetchLibraries()
            await fetchDailyPlays()
        }
    }

    // MARK: - Fetch activity

    private func fetchActivity() async {
        let cfg = config
        guard cfg.enabled, !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else {
            isConnected = false; return
        }
        guard let url = apiURL(cfg, cmd: "get_activity") else {
            isConnected = false; error = "Invalid URL"; return
        }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                isConnected = false; error = "Server error"; return
            }
            let decoded = try JSONDecoder().decode(
                TautulliResponse<TautulliActivityData>.self, from: data)
            guard decoded.response.result == "success" else {
                isConnected = false; error = decoded.response.result; return
            }
            streams     = (decoded.response.data?.sessions ?? []).map { mapSession($0, cfg: cfg) }
            isConnected = true
            self.error  = nil
        } catch {
            isConnected = false
            self.error  = error.localizedDescription
        }
    }

    // MARK: - Fetch libraries

    private func fetchLibraries() async {
        let cfg = config
        guard cfg.enabled, !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty,
              let url = apiURL(cfg, cmd: "get_libraries") else { return }
        guard let (data, _) = try? await session.data(from: url) else { return }

        // Tautulli returns data as a direct array: {"response":{"result":"success","data":[...]}}
        struct LibraryArrayOuter: Decodable {
            let result: String
            let data:   [TautulliLibraryWire]?
        }
        struct LibraryRoot: Decodable { let response: LibraryArrayOuter }
        guard let decoded = try? JSONDecoder().decode(LibraryRoot.self, from: data),
              decoded.response.result == "success",
              let sections = decoded.response.data else { return }

        // Aggregate by type for the donut
        var counts: [String: Int] = [:]
        for section in sections {
            counts[section.sectionType.value, default: 0] += section.count?.value ?? 0
        }
        libraryCounts = counts
            .sorted { $0.key < $1.key }
            .map { TautulliLibraryStat(type: $0.key, count: $0.value) }

        // Per-section stats — count only, no file size fetch
        driveStats = sections.compactMap { section in
            let sId = section.sectionId?.value ?? 0
            guard sId > 0 else { return nil }
            return TautulliDriveStat(
                sectionId:  sId,
                name:       section.sectionName.value,
                type:       section.sectionType.value,
                count:      section.count?.value ?? 0,
                totalBytes: 0
            )
        }
        saveCache()
    }

    // MARK: - Fetch daily plays

    private func fetchDailyPlays() async {
        let cfg = config
        guard cfg.enabled, !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty,
              var comps = URLComponents(string: "\(cfg.baseURL)/api/v2") else { return }
        comps.queryItems = [
            URLQueryItem(name: "apikey",     value: cfg.apiKey),
            URLQueryItem(name: "cmd",        value: "get_plays_by_date"),
            URLQueryItem(name: "time_range", value: "7"),
            URLQueryItem(name: "y_axis",     value: "plays"),
        ]
        guard let url = comps.url else { return }
        guard let (data, _) = try? await session.data(from: url) else { return }

        let decoded = try? JSONDecoder().decode(
            TautulliResponse<TautulliPlaysDateOuter>.self, from: data)
        guard let playsData = decoded?.response.data,
              decoded?.response.result == "success" else { return }

        dailyPlays = mapDailyPlays(playsData)
        saveCache()
    }

    // MARK: - Map session → ActiveStream

    private func mapSession(_ s: TautulliSession, cfg: ServiceConfig) -> ActiveStream {
        let mediaType: MediaType = s.mediaType == "movie" ? .movie : .tv
        let isTV = mediaType == .tv

        let userName = s.friendlyName ?? s.user ?? "Unknown"

        let displayTitle: String
        let subtitle: String?
        if isTV, let show = s.grandparentTitle, !show.isEmpty {
            displayTitle = show
            let season  = s.parentMediaIndex.flatMap(Int.init) ?? 0
            let episode = s.mediaIndex.flatMap(Int.init) ?? 0
            let epTitle = s.title ?? ""
            subtitle = season > 0 && episode > 0
                ? "S\(season)E\(episode) · \(epTitle)"
                : epTitle
        } else {
            displayTitle = s.title ?? "Unknown"
            subtitle = nil
        }

        let progressPct  = Double(s.progressPercent ?? "0") ?? 0
        let progress     = min(max(progressPct / 100.0, 0), 1)
        let viewOffsetMs = Int(s.viewOffset ?? "0") ?? 0
        let durationMs   = Int(s.duration   ?? "0") ?? 0
        let transcoding  = (s.videoDecision == "transcode")
        let bitrate      = Int(s.bitrate ?? "0") ?? 0

        let thumbPath = (isTV && !(s.grandparentThumb ?? "").isEmpty)
                        ? (s.grandparentThumb ?? s.thumb)
                        : s.thumb
        let posterURL = thumbPath.flatMap { posterProxyURL(cfg: cfg, path: $0) }

        return ActiveStream(
            id:          s.sessionId ?? UUID().uuidString,
            title:       displayTitle,
            subtitle:    subtitle,
            mediaType:   mediaType,
            userName:    userName,
            progress:    progress,
            duration:    durationMs / 1000,
            viewOffset:  viewOffsetMs / 1000,
            state:       s.state ?? "playing",
            transcoding: transcoding,
            bitrate:     bitrate,
            posterURL:   posterURL
        )
    }

    // MARK: - Map daily plays

    private func mapDailyPlays(_ d: TautulliPlaysDateOuter) -> [TautulliDayPlays] {
        var movieData = [Int](repeating: 0, count: d.categories.count)
        var tvData    = [Int](repeating: 0, count: d.categories.count)
        for series in d.series {
            switch series.name.lowercased() {
            case "movies": movieData = padded(series.data, to: d.categories.count)
            case "tv":     tvData    = padded(series.data, to: d.categories.count)
            default:       break
            }
        }
        return zip(d.categories, zip(movieData, tvData)).map { cat, counts in
            // Categories arrive as "Mon 04 Mar" — take first 3 chars as day abbreviation
            let label = cat.count >= 3 ? String(cat.prefix(3)) : cat
            return TautulliDayPlays(label: label, movies: counts.0, tv: counts.1)
        }
    }

    private func padded(_ arr: [Int], to count: Int) -> [Int] {
        guard arr.count < count else { return arr }
        return arr + [Int](repeating: 0, count: count - arr.count)
    }

    // MARK: - Test connection

    func testConnection(with cfg: ServiceConfig) async -> ConnectionResult {
        guard !cfg.baseURL.isEmpty, !cfg.apiKey.isEmpty else {
            return .failure("URL and API key required")
        }
        guard let url = apiURL(cfg, cmd: "get_server_info") else {
            return .failure("Invalid URL")
        }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return .failure("HTTP error")
            }
            let decoded = try JSONDecoder().decode(
                TautulliResponse<TautulliServerInfo>.self, from: data)
            if decoded.response.result == "success" {
                let ver = decoded.response.data?.pmsVersion ?? ""
                return .success(ver.isEmpty ? "Connected" : "Plex \(ver)")
            }
            return .failure(decoded.response.result)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    // MARK: - Helpers

    private func apiURL(_ cfg: ServiceConfig, cmd: String) -> URL? {
        guard var comps = URLComponents(string: "\(cfg.baseURL)/api/v2") else { return nil }
        comps.queryItems = [
            URLQueryItem(name: "apikey", value: cfg.apiKey),
            URLQueryItem(name: "cmd",    value: cmd),
        ]
        return comps.url
    }

    private func posterProxyURL(cfg: ServiceConfig, path: String) -> String? {
        guard var comps = URLComponents(string: "\(cfg.baseURL)/api/v2") else { return nil }
        comps.queryItems = [
            URLQueryItem(name: "apikey",   value: cfg.apiKey),
            URLQueryItem(name: "cmd",      value: "pms_image_proxy"),
            URLQueryItem(name: "img",      value: path),
            URLQueryItem(name: "width",    value: "150"),
            URLQueryItem(name: "height",   value: "225"),
            URLQueryItem(name: "fallback", value: "poster"),
        ]
        return comps.url?.absoluteString
    }

    /// Tautulli poster proxy URLs carry the API key as a query param, no extra headers needed.
    func posterHeaders() -> [String: String] { [:] }
}
